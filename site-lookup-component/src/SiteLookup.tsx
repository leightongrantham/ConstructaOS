import React, { useState } from 'react';
import { fetchSiteLookup } from './api';
import { FootprintMap } from './FootprintMap';
import type { SiteLookupResponse, SiteLookupResult } from './types';

export interface SiteLookupProps {
  /** Base URL of the ai-render-service (e.g. https://ai-render-service-weld.vercel.app) */
  apiBaseUrl: string;
  /** Called when user confirms the footprint with the final result */
  onLookupComplete: (result: SiteLookupResult) => void;
  /** Optional placeholder for address input */
  placeholder?: string;
  /** Optional label for the lookup button */
  lookupButtonLabel?: string;
  /** Optional CSS class for the root container */
  className?: string;
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
  const [pendingSelection, setPendingSelection] = useState<number | null>(null);
  const [selectedBuildingId, setSelectedBuildingId] = useState<number | null>(null);

  const primary = lookupData?.primary;
  const hasFootprint = primary?.footprintPolygon && primary.footprintPolygon.length >= 3;
  const isLowConfidence =
    primary?.confidence === 'Low' &&
    lookupData?.candidates &&
    lookupData.candidates.length > 0;
  const confirmedId = showBaselineSummary ? selectedBuildingId : pendingSelection;

  const handleLookup = async () => {
    const q = address.trim();
    if (!q) {
      setError('Please enter an address or postcode');
      return;
    }

    setLoading(true);
    setError(null);
    setLookupData(null);
    setShowFootprintConfirm(false);
    setShowBaselineSummary(false);
    setPendingSelection(null);
    setSelectedBuildingId(null);

    try {
      const data = await fetchSiteLookup(apiBaseUrl, q);
      setLookupData(data);

      const hasFp = data.primary?.footprintPolygon && data.primary.footprintPolygon.length >= 3;
      if (hasFp) {
        setShowFootprintConfirm(true);
      } else {
        setShowBaselineSummary(true);
        commitResult(data, null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Site lookup failed');
    } finally {
      setLoading(false);
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
      disclaimer: data.disclaimer,
    });
  };

  const handleConfirmFootprint = () => {
    if (!lookupData) return;
    const id = isLowConfidence ? pendingSelection : null;
    setSelectedBuildingId(id);
    setShowFootprintConfirm(false);
    setShowBaselineSummary(true);
  };

  const handleUseResult = () => {
    if (!lookupData) return;
    const id = showBaselineSummary ? selectedBuildingId : (isLowConfidence ? pendingSelection : null);
    commitResult(lookupData, id);
  };

  const baselineParts: string[] = [];
  if (primary) {
    if (primary.buildingForm !== 'Unknown') baselineParts.push(`Form: ${primary.buildingForm}`);
    if (primary.storeys !== 'Unknown') baselineParts.push(`Storeys: ${primary.storeys}`);
    if (primary.footprintScale !== 'Unknown')
      baselineParts.push(`Scale: ${primary.footprintScale} (${Math.round(primary.footprintAreaM2)} m²)`);
    baselineParts.push(`Confidence: ${primary.confidence}`);
  }

  return (
    <div className={className} style={{ fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder={placeholder}
          disabled={loading}
          onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
          style={{
            flex: 1,
            padding: '10px 12px',
            fontSize: 14,
            border: '1px solid #ccc',
            borderRadius: 4,
          }}
        />
        <button
          type="button"
          onClick={handleLookup}
          disabled={loading}
          style={{
            padding: '10px 20px',
            fontSize: 14,
            background: '#2196f3',
            color: 'white',
            border: 'none',
            borderRadius: 4,
            cursor: loading ? 'not-allowed' : 'pointer',
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
                {isLowConfidence
                  ? "We found several buildings nearby. Click the footprint that matches your building."
                  : "We've identified this building — please confirm it's correct."}
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
                  height: 280,
                  background: 'white',
                  borderRadius: 4,
                  overflow: 'hidden',
                  marginBottom: 12,
                }}
              >
                <FootprintMap
                  primaryPolygon={primary!.footprintPolygon}
                  neighbourPolygons={lookupData.neighbourPolygons}
                  candidates={isLowConfidence ? lookupData.candidates : undefined}
                  selectedId={isLowConfidence ? pendingSelection : null}
                  onSelect={isLowConfidence ? setPendingSelection : undefined}
                />
              </div>
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

          {showBaselineSummary && primary && (
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
              {confirmedId != null && (
                <div style={{ fontSize: 13, color: '#2e7d32', marginBottom: 8 }}>
                  Selected footprint: Building {confirmedId} — used for cost estimation and rendering.
                </div>
              )}
              {lookupData.candidates && lookupData.candidates.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  {lookupData.candidates.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedBuildingId(c.id)}
                      style={{
                        display: 'block',
                        width: '100%',
                        marginBottom: 8,
                        padding: 10,
                        textAlign: 'left',
                        background: selectedBuildingId === c.id ? '#e8f5e9' : 'white',
                        border: `2px solid ${selectedBuildingId === c.id ? '#4caf50' : '#ddd'}`,
                        borderRadius: 4,
                        cursor: 'pointer',
                        fontSize: 13,
                      }}
                    >
                      Building {c.id} — {c.distanceM}m away ({c.confidence})
                      {selectedBuildingId === c.id && ' ✓ Selected'}
                    </button>
                  ))}
                </div>
              )}
              {lookupData.disclaimer && (
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
