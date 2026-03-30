import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { FONTS, T } from '@ui/theme/elvui';
import { buildHudFrameStyle } from '@ui/theme/stylePrimitives';

export interface SearchSuggestion {
  id: string;
  value: string;
  label: string;
  keywords?: readonly string[];
}

export interface SearchableTextInputProps {
  ariaLabel: string;
  value: string;
  placeholder?: string;
  suggestions: readonly SearchSuggestion[];
  onChange: (value: string) => void;
  onSuggestionSelect?: (suggestion: SearchSuggestion) => void;
  onSuggestionApply?: (currentValue: string, suggestion: SearchSuggestion) => string;
  queryExtractor?: (value: string) => string;
  inputStyle?: CSSProperties;
}

/**
 * Text input with an inline searchable suggestion list for loadout and tracker fields.
 */
export function SearchableTextInput({
  ariaLabel,
  value,
  placeholder,
  suggestions,
  onChange,
  onSuggestionSelect,
  onSuggestionApply,
  queryExtractor,
  inputStyle,
}: SearchableTextInputProps): React.ReactElement {
  const [isFocused, setIsFocused] = useState(false);
  const blurTimeoutRef = useRef<number | null>(null);
  const query = (queryExtractor ? queryExtractor(value) : value).trim().toLowerCase();

  useEffect(() => (
    (): void => {
      if (blurTimeoutRef.current !== null) {
        window.clearTimeout(blurTimeoutRef.current);
      }
    }
  ), []);

  const filteredSuggestions = useMemo(() => {
    if (!isFocused) {
      return [];
    }

    const matches = suggestions.filter((suggestion) => {
      if (query.length === 0) {
        return true;
      }

      const haystacks = [
        suggestion.value,
        suggestion.label,
        ...(suggestion.keywords ?? []),
      ];
      return haystacks.some((candidate) => candidate.toLowerCase().includes(query));
    });

    return matches.slice(0, 8);
  }, [isFocused, query, suggestions]);

  return (
    <div style={{ display: 'grid', gap: 6, position: 'relative' }}>
      <input
        aria-label={ariaLabel}
        value={value}
        placeholder={placeholder}
        onFocus={(): void => {
          if (blurTimeoutRef.current !== null) {
            window.clearTimeout(blurTimeoutRef.current);
            blurTimeoutRef.current = null;
          }
          setIsFocused(true);
        }}
        onBlur={(): void => {
          if (blurTimeoutRef.current !== null) {
            window.clearTimeout(blurTimeoutRef.current);
          }
          blurTimeoutRef.current = window.setTimeout(() => {
            setIsFocused(false);
            blurTimeoutRef.current = null;
          }, 0);
        }}
        onChange={(event): void => onChange(event.target.value)}
        style={inputStyle}
      />
      {filteredSuggestions.length > 0 && (
        <div
          data-testid={`${ariaLabel.replace(/\s+/g, '-').toLowerCase()}-suggestions`}
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 10,
            ...buildHudFrameStyle({ compact: true }),
            borderColor: T.borderBright,
            borderRadius: 14,
            background: 'linear-gradient(180deg, rgba(8, 13, 24, 0.99), rgba(4, 9, 18, 0.98))',
            boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
            overflow: 'hidden',
          }}
        >
          {filteredSuggestions.map((suggestion) => (
            <button
              key={suggestion.id}
              type="button"
              onMouseDown={(event): void => {
                event.preventDefault();
                if (onSuggestionSelect) {
                  onSuggestionSelect(suggestion);
                } else {
                  const nextValue = onSuggestionApply ? onSuggestionApply(value, suggestion) : suggestion.value;
                  onChange(nextValue);
                }
                setIsFocused(false);
              }}
              style={{
                width: '100%',
                textAlign: 'left',
                border: 'none',
                borderBottom: `1px solid ${T.border}`,
                background: 'linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0))',
                color: T.textBright,
                padding: '10px 12px',
                fontFamily: FONTS.body,
                fontSize: '0.74rem',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                <span>{suggestion.label}</span>
                <span
                  style={{
                    color: T.accent,
                    fontSize: '0.62rem',
                    fontFamily: FONTS.ui,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                  }}
                >
                  Suggestion
                </span>
              </div>
              <div style={{ color: T.textDim, fontSize: '0.68rem', marginTop: 4, fontFamily: FONTS.ui }}>{suggestion.value}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default SearchableTextInput;
