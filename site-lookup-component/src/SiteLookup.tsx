import React, { useState, useRef, useEffect, useCallback } from 'react';
import { fetchSiteLookup } from './api';
import { FootprintMap } from './FootprintMap';
import { useSiteLookupStore } from './siteLookupStore';
import { getConfidenceLabel } from './utils/confidence';
import type { SiteLookupResponse, SiteLookupResult, SiteLookupCandidate } from './types';

/**
 * TEST CHECKLIST — Footprint detection & renderer payload
 * Use real addresses or lat/lng for each scenario and verify:
 *
 * 1. Mid-terrace house
 *    - [ ] Classification: terrace
 *    - [ ] Adjacency count: >= 2
 *    - [ ] Manual selection: selecting another candidate updates classification in store/UI
 *    - [ ] Renderer payload: existingBuilding { classification, footprintArea, adjacencyCount } matches selected footprint
 *
 * 2. End-of-terrace
 *    - [ ] Classification: terrace (or semi if only one neighbour)
 *    - [ ] Adjacency count: 1 or 2 depending on detection
 *    - [ ] Manual selection: switching footprint updates buildingClassification, footprintArea, adjacencyCount
 *    - [ ] Renderer payload: selected footprint data sent; no API re-call on selection change
 *
 * 3. Semi-detached
 *    - [ ] Classification: semi
 *    - [ ] Adjacency count: 1
 *    - [ ] Manual selection: selecting the other half updates classification (e.g. to terrace if that one has 2 neighbours)
 *    - [ ] Renderer payload: existingBuilding reflects current selection after change
 *
 * 4. Detached suburban
 *    - [ ] Classification: detached
 *    - [ ] Adjacency count: 0
 *    - [ ] Manual selection: selecting a different candidate (if any) updates classification/area/adjacency
 *    - [ ] Renderer payload: existingBuilding.classification === 'detached', adjacencyCount === 0
 *
 * 5. Corner plot
 *    - [ ] Classification: terrace or semi depending on touching neighbours
 *    - [ ] Adjacency count: 1 or 2
 *    - [ ] Manual selection: changing to adjacent building updates store and payload
 *    - [ ] Renderer payload: payload uses selected footprint only (not auto-detected)
 *
 * 6. Infill urban plot
 *    - [ ] Classification: terrace or semi (dense urban)
 *    - [ ] Adjacency count: >= 1
 *    - [ ] Manual selection: "Revert to auto-detected building" restores best candidate and recomputes classification
 *    - [ ] Renderer payload: existingBuilding updates when user selects different footprint; footprintRevision triggers recompute
 */

export interface SiteLookupProps {
  /** Base URL of the ai-render-service (e.g. https://ai-render-service-weld.vercel.app) */
  apiBaseUrl: string;
  /** Called when user confirms the footprint (e.g. clicks "Use this site"). Only update site state here; do not trigger a render. */
  onLookupComplete: (result: SiteLookupResult) => void;
  /** Optional placeholder for address input */
  placeholder?: string;
  /** Optional label for the lookup button */
  lookupButtonLabel?: string;
  /** Optional CSS class for the root container */
  className?: string;
}

interface NominatimSuggestion {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

function classificationLabel(
  classification: 'detached' | 'semi' | 'terrace' | null
): string {
  if (!classification) return '—';
  if (classification === 'semi') return 'Semi';
  return classification.charAt(0).toUpperCase() + classification.slice(1);
}

/** Uses simplified polygons from store for rendering when available; falls back to raw polygons. Selection is from store (click updates store). */
function FootprintMapWithStoreCandidates({
  fallbackPrimaryPolygon,
  fallbackNeighbourPolygons,
  candidates,
}: {
  fallbackPrimaryPolygon: Array<[number, number]>;
  fallbackNeighbourPolygons: Array<{ id: number; polygon: Array<[number, number]> }>;
  candidates: SiteLookupCandidate[];
}) {
  const neighbourPolygonsForRendering = useSiteLookupStore((s) => s.neighbourPolygonsForRendering);
  const primaryPolygonForRendering = useSiteLookupStore((s) => s.primaryPolygonForRendering);
  const neighbourPolygons =
    neighbourPolygonsForRendering.length > 0 ? neighbourPolygonsForRendering : fallbackNeighbourPolygons;
  const primaryPolygon = primaryPolygonForRendering ?? fallbackPrimaryPolygon;
  return (
    <FootprintMap
      primaryPolygon={primaryPolygon}
      neighbourPolygons={neighbourPolygons}
      candidates={candidates}
    />
  );
}

function DetectedFootprintPanel() {
  const buildingClassification = useSiteLookupStore((s) => s.buildingClassification);
  const footprintConfidence = useSiteLookupStore((s) => s.footprintConfidence);
  const footprintArea = useSiteLookupStore((s) => s.footprintArea);
  const candidateFootprints = useSiteLookupStore((s) => s.candidateFootprints);
  const selectedFootprintId = useSiteLookupStore((s) => s.selectedFootprintId);
  const setSelectedFootprint = useSiteLookupStore((s) => s.setSelectedFootprint);

  const confidenceLabel = getConfidenceLabel(footprintConfidence);
  const areaSqm = footprintArea != null ? Math.round(footprintArea) : null;
  const showLowConfidenceWarning = footprintConfidence < 0.6;
  const bestId = candidateFootprints[0]?.id ?? null;
  const showRevert = candidateFootprints.length > 0 && selectedFootprintId !== bestId;

  return (
    <div
      style={{
        padding: 14,
        marginBottom: 12,
        background: '#fff',
        border: '1px solid #e0e0e0',
        borderRadius: 6,
      }}
    >
      <h4 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 600, color: '#333' }}>
        Detected Building Footprint
      </h4>
      <div style={{ fontSize: 14, color: '#555', marginBottom: 6 }}>
        <strong>Classification:</strong> {classificationLabel(buildingClassification)}
      </div>
      <div style={{ fontSize: 14, color: '#555', marginBottom: 6 }}>
        <strong>Confidence:</strong> {confidenceLabel}
      </div>
      <div style={{ fontSize: 14, color: '#555', marginBottom: showLowConfidenceWarning ? 10 : 6 }}>
        <strong>Area:</strong> {areaSqm != null ? `${areaSqm} sqm` : '—'}
      </div>
      {showLowConfidenceWarning && (
        <div
          style={{
            marginBottom: 10,
            padding: '8px 10px',
            fontSize: 13,
            background: '#fff8e1',
            color: '#f57f17',
            borderRadius: 4,
            borderLeft: '4px solid #ffc107',
          }}
        >
          Low confidence detection. Please confirm your building.
        </div>
      )}
      <p style={{ margin: 0, fontSize: 12, color: '#757575' }}>
        You can click a different footprint on the map if this looks incorrect.
      </p>
      {showRevert && (
        <button
          type="button"
          onClick={() => setSelectedFootprint(bestId)}
          style={{
            marginTop: 8,
            padding: 0,
            border: 'none',
            background: 'none',
            fontSize: 12,
            color: '#1565c0',
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          Revert to auto-detected building
        </button>
      )}
    </div>
  );
}

export function SiteLookup({
  apiBaseUrl,
  onLookupComplete,
  placeholder = 'Enter address or postcode',
  lookupButtonLabel = 'Lookup',
  className,
}: SiteLookupProps) {
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lookupData, setLookupData] = useState<SiteLookupResponse | null>(null);
  const [showFootprintConfirm, setShowFootprintConfirm] = useState(false);
  const [showBaselineSummary, setShowBaselineSummary] = useState(false);
  const selectedFootprintId = useSiteLookupStore((s) => s.selectedFootprintId);

  // Autocomplete state
  const [suggestions, setSuggestions] = useState<NominatimSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const debouncedAddress = useDebounce(address, 300);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const suppressFetchRef = useRef(false);

  // Fetch address suggestions from Nominatim
  useEffect(() => {
    if (suppressFetchRef.current) {
      suppressFetchRef.current = false;
      return;
    }
    if (debouncedAddress.trim().length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    let cancelled = false;
    const encoded = encodeURIComponent(debouncedAddress.trim());
    fetch(
      `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=5&addressdetails=1&countrycodes=gb`,
      { headers: { 'User-Agent': 'ConstructaOS-SiteLookup/1.0' } }
    )
      .then((r) => r.json())
      .then((data: NominatimSuggestion[]) => {
        if (cancelled) return;
        setSuggestions(data);
        setShowSuggestions(data.length > 0);
        setActiveSuggestion(-1);
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      });
    return () => { cancelled = true; };
  }, [debouncedAddress]);

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const doLookup = useCallback(async (query: string) => {
    const q = query.trim();
    if (!q) {
      setError('Please enter an address or postcode');
      return;
    }

    setLoading(true);
    setError(null);
    setLookupData(null);
    setShowFootprintConfirm(false);
    setShowBaselineSummary(false);
    setShowSuggestions(false);
    useSiteLookupStore.getState().reset();

    try {
      const data = await fetchSiteLookup(apiBaseUrl, q);
      setLookupData(data);
      useSiteLookupStore.getState().setFromLookupResponse(data);

      const hasFp = data.primary?.footprintPolygon && data.primary.footprintPolygon.length >= 3;
      const noBuildings = (data.candidates?.length ?? 0) === 0;
      if (hasFp) {
        setShowFootprintConfirm(true);
      } else if (noBuildings) {
        setShowBaselineSummary(true);
        // Do not auto-commit: show message and let user continue without footprint
      } else {
        setShowBaselineSummary(true);
        commitResult(data, null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Site lookup failed');
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl]);

  const handleLookup = () => doLookup(address);

  const handleSelectSuggestion = (suggestion: NominatimSuggestion) => {
    suppressFetchRef.current = true;
    setAddress(suggestion.display_name);
    setShowSuggestions(false);
    setSuggestions([]);
    doLookup(suggestion.display_name);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === 'Enter') handleLookup();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSuggestion((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSuggestion((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeSuggestion >= 0 && activeSuggestion < suggestions.length) {
        handleSelectSuggestion(suggestions[activeSuggestion]);
      } else {
        handleLookup();
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const commitResult = (data: SiteLookupResponse, buildingId: number | null) => {
    onLookupComplete({
      lat: data.lat,
      lng: data.lng,
      displayName: data.displayName,
      primary: data.primary,
      selectedBuildingId: buildingId,
      neighbourPolygons: data.neighbourPolygons,
      candidates: data.candidates,
      disclaimer: data.disclaimer,
      valuation: data.valuation,
    });
  };

  const handleConfirmFootprint = () => {
    if (!lookupData) return;
    setShowFootprintConfirm(false);
    setShowBaselineSummary(true);
  };

  const handleUseResult = () => {
    if (!lookupData) return;
    commitResult(lookupData, useSiteLookupStore.getState().selectedFootprintId);
  };

  const primary = lookupData?.primary;
  const hasFootprint = primary?.footprintPolygon && primary.footprintPolygon.length >= 3;

  const baselineParts: string[] = [];
  if (primary) {
    if (primary.buildingForm !== 'Unknown') baselineParts.push(`Form: ${primary.buildingForm}`);
    if (primary.storeys !== 'Unknown') baselineParts.push(`Storeys: ${primary.storeys}`);
    if (primary.footprintScale !== 'Unknown')
      baselineParts.push(`Scale: ${primary.footprintScale} (${Math.round(primary.footprintAreaM2)} m²)`);
    baselineParts.push(`Confidence: ${primary.confidence}`);
  }

  return (
    <div className={className} style={{ fontFamily: 'system-ui, sans-serif', width: '100%' }}>
      {/* Address input with autocomplete */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, position: 'relative', width: '100%' }}>
        <div style={{ flex: '1 1 0', minWidth: 0, position: 'relative' }}>
          <input
            ref={inputRef}
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={loading}
            autoComplete="off"
            style={{
              width: '100%',
              padding: '16px 20px',
              fontSize: 17,
              minHeight: 52,
              border: '1px solid #ccc',
              borderRadius: 4,
              boxSizing: 'border-box',
            }}
          />
          {showSuggestions && suggestions.length > 0 && (
            <div
              ref={suggestionsRef}
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                background: 'white',
                border: '1px solid #ddd',
                borderTop: 'none',
                borderRadius: '0 0 4px 4px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                zIndex: 1000,
                maxHeight: 240,
                overflowY: 'auto',
              }}
            >
              {suggestions.map((s, i) => (
                <div
                  key={s.place_id}
                  onClick={() => handleSelectSuggestion(s)}
                  onMouseEnter={() => setActiveSuggestion(i)}
                  style={{
                    padding: '10px 12px',
                    fontSize: 13,
                    cursor: 'pointer',
                    background: i === activeSuggestion ? '#f0f7ff' : 'white',
                    borderBottom: i < suggestions.length - 1 ? '1px solid #f0f0f0' : 'none',
                    lineHeight: 1.4,
                  }}
                >
                  {s.display_name}
                </div>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={handleLookup}
          disabled={loading}
          style={{
            padding: '8px 14px',
            fontSize: 14,
            flex: '0 0 auto',
            background: '#2196f3',
            color: 'white',
            border: 'none',
            borderRadius: 4,
            cursor: loading ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
            alignSelf: 'center',
          }}
        >
          {loading ? 'Looking up…' : lookupButtonLabel}
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: 12,
            marginBottom: 12,
            background: '#ffebee',
            color: '#c62828',
            borderRadius: 4,
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}

      {lookupData && (
        <div style={{ marginTop: 16 }}>
          <div style={{ marginBottom: 12, fontSize: 14, color: '#555' }}>
            <strong>{lookupData.displayName}</strong>
          </div>

          {lookupData.valuation != null && (
            <div
              style={{
                padding: 12,
                marginBottom: 12,
                background: '#f5f5f5',
                borderRadius: 4,
                borderLeft: '4px solid #666',
              }}
            >
              <h4 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: '#333' }}>
                Indicative sale value
              </h4>
              {(lookupData.valuation.indicativeValueGbp != null ||
                lookupData.valuation.rangeLowGbp != null ||
                lookupData.valuation.rangeHighGbp != null) && (
                <div style={{ fontSize: 14, color: '#333', marginBottom: 8 }}>
                  {lookupData.valuation.indicativeValueGbp != null && (
                    <span>
                      ~£{lookupData.valuation.indicativeValueGbp.toLocaleString('en-GB')}
                      {(lookupData.valuation.rangeLowGbp != null || lookupData.valuation.rangeHighGbp != null) && ' '}
                    </span>
                  )}
                  {lookupData.valuation.rangeLowGbp != null && lookupData.valuation.rangeHighGbp != null && (
                    <span style={{ color: '#555' }}>
                      (range: £{lookupData.valuation.rangeLowGbp.toLocaleString('en-GB')} – £
                      {lookupData.valuation.rangeHighGbp.toLocaleString('en-GB')})
                    </span>
                  )}
                </div>
              )}
              <p style={{ margin: 0, fontSize: 12, color: '#666' }}>
                {lookupData.valuation.disclaimer}
              </p>
            </div>
          )}

          {showFootprintConfirm && hasFootprint && (
            <div
              style={{
                padding: 16,
                background: '#f5f5f5',
                borderRadius: 4,
                marginBottom: 12,
              }}
            >
              <p style={{ margin: '0 0 12px', fontSize: 14 }}>
                Click a building footprint to select it, then confirm.
              </p>
              {primary && (
                <span
                  style={{
                    display: 'inline-block',
                    padding: '4px 8px',
                    marginBottom: 12,
                    fontSize: 12,
                    borderRadius: 4,
                    background:
                      primary.confidence === 'High'
                        ? '#e8f5e9'
                        : primary.confidence === 'Medium'
                          ? '#fff3e0'
                          : '#ffebee',
                  }}
                >
                  {primary.confidence} confidence
                </span>
              )}
              <div
                style={{
                  width: '100%',
                  height: 300,
                  background: '#f8fafb',
                  borderRadius: 6,
                  overflow: 'hidden',
                  marginBottom: 12,
                  border: '1px solid #e0e0e0',
                }}
              >
                <FootprintMapWithStoreCandidates
                  fallbackPrimaryPolygon={primary!.footprintPolygon}
                  fallbackNeighbourPolygons={lookupData.neighbourPolygons}
                  candidates={lookupData.candidates}
                />
              </div>
              <DetectedFootprintPanel />
              <button
                type="button"
                onClick={handleConfirmFootprint}
                style={{
                  padding: '10px 20px',
                  fontSize: 14,
                  background: '#4caf50',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
              >
                Confirm footprint
              </button>
            </div>
          )}

          {lookupData && (lookupData.candidates?.length ?? 0) === 0 && (
            <div
              style={{
                padding: 16,
                background: '#fff8e1',
                borderLeft: '4px solid #ffc107',
                borderRadius: 4,
                marginBottom: 12,
              }}
            >
              <p style={{ margin: '0 0 12px', fontSize: 14, color: '#333' }}>
                We couldn't automatically detect your building footprint.
              </p>
              <button
                type="button"
                onClick={() => commitResult(lookupData, null)}
                style={{
                  padding: '10px 20px',
                  fontSize: 14,
                  background: '#2196f3',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
              >
                Continue without footprint
              </button>
            </div>
          )}

          {showBaselineSummary && primary && (lookupData?.candidates?.length ?? 0) > 0 && (
            <div
              style={{
                padding: 16,
                background: '#e8f5e9',
                borderLeft: '4px solid #4caf50',
                borderRadius: 4,
                marginBottom: 12,
              }}
            >
              <div style={{ fontSize: 14, marginBottom: 8 }}>
                {baselineParts.join(' • ')}
              </div>
              {selectedFootprintId != null && (
                <div style={{ fontSize: 13, color: '#2e7d32', marginBottom: 8 }}>
                  Selected footprint: Building {selectedFootprintId} — used for cost estimation and rendering.
                </div>
              )}
              {lookupData?.disclaimer && (
                <div style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>
                  {lookupData.disclaimer}
                </div>
              )}
              <button
                type="button"
                onClick={handleUseResult}
                style={{
                  padding: '10px 20px',
                  fontSize: 14,
                  background: '#2196f3',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
              >
                Use this site
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
