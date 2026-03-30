/**
 * SimC SpellDataDump parser
 * Parses simplified spell data format into typed spell records.
 */

export interface SpellRecord {
  id: number;
  name: string;
  baseDamageMin: number;
  baseDamageMax: number;
  apCoefficient: number; // attack power scaling coefficient
  cooldownBase: number; // cooldown in seconds (0 = no cooldown or GCD-only)
  isOnGcd: boolean; // whether the spell triggers the GCD
  resourceCostType: 'energy' | 'chi' | 'none';
  resourceCost: number; // amount of resource cost (0 if none)
  resourceGainType: 'energy' | 'chi' | 'none'; // type of resource gained on cast
  resourceGain: number; // amount of resource gained on cast (0 if none)
}

/**
 * Parses a SimC SpellDataDump text string into a Map of spell records.
 *
 * Format:
 * ```
 * # Comments start with #
 * # Each spell is one block, fields on separate lines or all on one line
 * # Format: SPELL <id> <name>
 * #   base_dd: <min>-<max>
 * #   ap_coeff: <value>
 * #   cooldown: <seconds>
 * #   gcd: <yes|no>
 * #   cost: <type> <amount>
 * #   gain: <type> <amount>
 * # END
 * ```
 *
 * @param text - The spell data dump text
 * @returns A Map keyed by spell ID
 */
export function parseSpellDataDump(text: string): Map<number, SpellRecord> {
  const result = new Map<number, SpellRecord>();

  if (!text || text.trim().length === 0) {
    return result;
  }

  const lines = text.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    i++;

    // Skip empty lines and comments
    if (!line || line.startsWith('#')) {
      continue;
    }

    // Look for spell start
    if (line.startsWith('SPELL ')) {
      const parseResult = parseSpellBlock(lines, i - 1);
      if (parseResult.record) {
        result.set(parseResult.record.id, parseResult.record);
      }
      // Only skip to END if we entered the block (valid header).
      // If the header was invalid, there may be no END — just advance one line.
      if (parseResult.enteredBlock) {
        while (i < lines.length && !lines[i].trim().startsWith('END')) {
          i++;
        }
        if (i < lines.length && lines[i].trim() === 'END') {
          i++;
        }
      }
    }
  }

  return result;
}

interface SpellBlockResult {
  record: SpellRecord | null;
  enteredBlock: boolean; // true if we parsed past the SPELL header line
}

/**
 * Parse a single spell block starting from the SPELL line.
 * Returns a result indicating whether the block was entered and the parsed record (if successful).
 * enteredBlock is false when the SPELL header itself was invalid (no END expected).
 */
function parseSpellBlock(
  lines: string[],
  startIndex: number
): SpellBlockResult {
  const spellLine = lines[startIndex].trim();

  // Parse SPELL header: "SPELL <id> <name>"
  const spellRegex = /^SPELL\s+(\d+)\s+(.+)$/;
  const spellMatch = spellRegex.exec(spellLine);
  if (!spellMatch) {
    console.warn(`Invalid SPELL header format: ${spellLine}`);
    return { record: null, enteredBlock: false };
  }

  const id = parseInt(spellMatch[1], 10);
  const name = spellMatch[2];

  // Initialize defaults
  const record: SpellRecord = {
    id,
    name,
    baseDamageMin: 0,
    baseDamageMax: 0,
    apCoefficient: 0,
    cooldownBase: 0,
    isOnGcd: true,
    resourceCostType: 'none',
    resourceCost: 0,
    resourceGainType: 'none',
    resourceGain: 0,
  };

  // Parse fields until we hit END
  let i = startIndex + 1;
  let hasFatalError = false;

  while (i < lines.length) {
    const line = lines[i].trim();
    i++;

    // Skip empty lines and comments
    if (!line || line.startsWith('#')) {
      continue;
    }

    // Check for END marker
    if (line === 'END') {
      if (hasFatalError) {
        return { record: null, enteredBlock: true };
      }
      return { record, enteredBlock: true };
    }

    // Parse field: "key: value"
    const fieldRegex = /^([^:]+):\s*(.+)$/;
    const fieldMatch = fieldRegex.exec(line);
    if (!fieldMatch) {
      console.warn(
        `Malformed field in spell ${id}: ${line} (expected "key: value" format)`
      );
      continue;
    }

    const key = fieldMatch[1].trim();
    const value = fieldMatch[2].trim();

    try {
      parseField(record, key, value);
    } catch (error) {
      // For certain required fields, mark as fatal error
      if (key === 'base_dd') {
        console.warn(
          `Failed to parse required field "${key}" for spell ${id}: ${error instanceof Error ? error.message : String(error)}`
        );
        hasFatalError = true;
      } else {
        console.warn(
          `Failed to parse field "${key}" for spell ${id}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  // If we reach here, we never found END
  console.warn(`Missing END marker for spell ${id}`);
  return { record: null, enteredBlock: true };
}

/**
 * Parse a single field and update the record.
 * Throws an error if the field value is invalid.
 */
function parseField(record: SpellRecord, key: string, value: string): void {
  switch (key) {
    case 'base_dd': {
      const baseDdRegex = /^(\d+)-(\d+)$/;
      const match = baseDdRegex.exec(value);
      if (!match) {
        throw new Error(
          `Invalid base_dd format: "${value}" (expected "min-max")`
        );
      }
      record.baseDamageMin = parseInt(match[1], 10);
      record.baseDamageMax = parseInt(match[2], 10);
      break;
    }

    case 'ap_coeff': {
      const num = parseFloat(value);
      if (isNaN(num)) {
        throw new Error(`Invalid ap_coeff: "${value}" (expected number)`);
      }
      record.apCoefficient = num;
      break;
    }

    case 'cooldown': {
      const num = parseFloat(value);
      if (isNaN(num)) {
        throw new Error(`Invalid cooldown: "${value}" (expected number)`);
      }
      record.cooldownBase = num;
      break;
    }

    case 'gcd': {
      if (value === 'yes') {
        record.isOnGcd = true;
      } else if (value === 'no') {
        record.isOnGcd = false;
      } else {
        throw new Error(`Invalid gcd value: "${value}" (expected "yes" or "no")`);
      }
      break;
    }

    case 'cost': {
      const costRegex = /^(\w+)\s+(\d+)$/;
      const match = costRegex.exec(value);
      if (!match) {
        throw new Error(
          `Invalid cost format: "${value}" (expected "type amount")`
        );
      }
      const type = match[1];
      const amount = parseInt(match[2], 10);

      if (type !== 'energy' && type !== 'chi' && type !== 'none') {
        throw new Error(
          `Invalid cost type: "${type}" (expected "energy", "chi", or "none")`
        );
      }

      record.resourceCostType = type;
      record.resourceCost = amount;
      break;
    }

    case 'gain': {
      const gainRegex = /^(\w+)\s+(\d+)$/;
      const match = gainRegex.exec(value);
      if (!match) {
        throw new Error(
          `Invalid gain format: "${value}" (expected "type amount")`
        );
      }
      const gainType = match[1];
      if (gainType !== 'energy' && gainType !== 'chi' && gainType !== 'none') {
        throw new Error(
          `Invalid gain type: "${gainType}" (expected "energy", "chi", or "none")`
        );
      }
      record.resourceGainType = gainType;
      record.resourceGain = parseInt(match[2], 10);
      break;
    }

    default: {
      // Unknown field - log warning and skip
      console.warn(
        `Unknown field in spell ${record.id}: "${key}" (skipping)`
      );
      break;
    }
  }
}
