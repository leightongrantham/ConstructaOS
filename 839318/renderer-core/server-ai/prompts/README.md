# Prompt Engineering for Topology Extraction

## Overview

The prompt system is structured to ensure deterministic, structured output from the LLM for architectural geometry extraction. This document explains the design decisions behind the prompt structure.

## File Structure

- **`topology.system.txt`**: System prompt defining the LLM's role and processing rules
- **`topology.user.template.txt`**: User prompt template with placeholders for dynamic data
- **`topology.response.schema.json`**: JSON schema for response validation

## Design Rationale

### 1. Deterministic Behavior

The system prompt emphasizes deterministic behavior because:
- **Consistency**: Same input should produce same output for reproducible results
- **Debugging**: Predictable outputs make it easier to identify and fix issues
- **Validation**: Deterministic outputs are easier to validate and test

The prompt explicitly instructs the LLM to:
- Apply rules in a consistent order (normalize → snap → merge → classify)
- Use consistent ID generation patterns
- Make decisions based on clear, unambiguous rules

### 2. JSON-Only Output

The prompt strongly emphasizes outputting ONLY JSON because:
- **Parsing**: Structured JSON is easier to parse and validate programmatically
- **Reliability**: Prevents parsing errors from markdown code blocks or explanatory text
- **Integration**: Direct JSON output integrates seamlessly with the API response pipeline

Multiple reminders throughout the prompt reinforce this requirement.

### 3. Geometry Processing Rules

The rules are structured hierarchically:

**Angle Snapping (90°/45° increments)**
- Architectural drawings often have slight imperfections
- Snapping to standard angles produces cleaner, more usable geometry
- 5° tolerance balances precision with practicality

**Wall Merging**
- Reduces duplicate/overlapping geometry
- Simplifies the topology for downstream processing
- 0.1m threshold is reasonable for typical drawing precision

**Default Thickness (0.25m)**
- Provides a sensible default when thickness cannot be inferred
- Matches common interior wall thickness in many building codes
- Can be overridden by context clues

**Numeric Normalization (minX=0, minY=0)**
- Standardizes coordinate systems across different drawings
- Makes geometry easier to compare and process
- Simplifies bounding box calculations

### 4. Template-Based User Prompt

The user prompt uses template placeholders (`{{POLYLINES_JSON}}`, `{{METADATA_JSON}}`) because:
- **Separation of Concerns**: Keeps prompt structure separate from data injection
- **Maintainability**: Easier to update prompt without touching code
- **Flexibility**: Can easily swap different data formats or add new placeholders

### 5. Schema Validation

The response schema serves dual purposes:
- **LLM Guidance**: Can be included in prompts to guide output format (though not used here to keep prompts concise)
- **Server Validation**: Used by the server to validate LLM responses before returning to clients
- **Documentation**: Serves as clear documentation of expected output structure

## Usage Pattern

1. Load system prompt to establish LLM role and rules
2. Inject polylines and metadata into user template
3. Send both prompts to LLM
4. Parse and validate response against schema
5. Return validated geometry or error

## Best Practices

- **Keep prompts focused**: Each rule has a specific purpose
- **Be explicit**: Ambiguity leads to inconsistent outputs
- **Provide examples**: The output format example in the system prompt helps guide the LLM
- **Validate strictly**: Always validate LLM output against schema before use
- **Log failures**: When validation fails, log the raw response for prompt improvement

## Future Improvements

- Add few-shot examples of correct outputs
- Include common error patterns and how to avoid them
- Add temperature=0 for maximum determinism (if using non-deterministic models)
- Consider function calling/structured outputs API for better reliability

