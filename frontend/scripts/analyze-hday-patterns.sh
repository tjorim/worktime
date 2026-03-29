#!/bin/bash
# Bash script to analyze .hday files and extract unique patterns
# Usage: ./analyze-hday-patterns.sh /path/to/hday/files [max_files]

if [ -z "$1" ]; then
    echo "Usage: $0 <path-to-hday-files> [max_files]"
    echo "Example: $0 /mnt/share/CUG_holiday"
    echo "Example: $0 /mnt/share/CUG_holiday 100"
    exit 1
fi

HDAY_PATH="$1"
MAX_FILES="${2:-0}"  # Default to 0 (all files)

echo "Scanning .hday files in: $HDAY_PATH"
echo ""

# Create temp file for processing
TEMP_FILE=$(mktemp)
trap "rm -f $TEMP_FILE" EXIT

# Find all .hday files
if [ "$MAX_FILES" -gt 0 ]; then
    find "$HDAY_PATH" -name "*.hday" -type f | head -n "$MAX_FILES" > "$TEMP_FILE"
    echo "Limiting to first $MAX_FILES files"
else
    find "$HDAY_PATH" -name "*.hday" -type f > "$TEMP_FILE"
fi

FILE_COUNT=$(wc -l < "$TEMP_FILE")
echo "Found $FILE_COUNT .hday files"
echo ""

# Create temp files for pattern analysis
PREFIX_FILE=$(mktemp)
EXAMPLE_FILE=$(mktemp)
trap "rm -f $TEMP_FILE $PREFIX_FILE $EXAMPLE_FILE" EXIT

# Regular expressions
RE_RANGE='^([a-z]*)([0-9]{4}/[0-9]{2}/[0-9]{2})(-([0-9]{4}/[0-9]{2}/[0-9]{2}))?(\s*#.*)?$'
RE_WEEKLY='^([a-z]*?)d([0-6])(\s*#.*)?$'

LINE_COUNT=0

# Process all files
while IFS= read -r file; do
    while IFS= read -r line; do
        # Skip empty lines and comments
        line=$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
        [ -z "$line" ] && continue
        [[ "$line" =~ ^[#r] ]] && continue

        ((LINE_COUNT++))

        # Extract prefix
        if [[ "$line" =~ $RE_RANGE ]]; then
            prefix="${BASH_REMATCH[1]}"
            [ -z "$prefix" ] && prefix="(none)"
            echo "$prefix" >> "$PREFIX_FILE"
            echo "$prefix|$line" >> "$EXAMPLE_FILE"
        elif [[ "$line" =~ $RE_WEEKLY ]]; then
            prefix="${BASH_REMATCH[1]}d*"
            [ "$prefix" = "d*" ] && prefix="(none)d*"
            echo "$prefix" >> "$PREFIX_FILE"
            echo "$prefix|$line" >> "$EXAMPLE_FILE"
        fi
    done < "$file" 2>/dev/null
done < "$TEMP_FILE"

echo "Analyzed $LINE_COUNT total entries"
echo ""
echo "================================================================================"
echo "PREFIX PATTERN SUMMARY"
echo "================================================================================"
echo ""

# Get unique prefixes with counts, sorted by frequency
sort "$PREFIX_FILE" | uniq -c | sort -rn | while read count prefix; do
    percentage=$(awk "BEGIN {printf \"%.2f\", ($count / $LINE_COUNT) * 100}")

    # Decode prefix
    decoded=""
    case "$prefix" in
        "(none)")
            decoded="Regular vacation/holiday"
            ;;
        "(none)d*")
            decoded="Weekly recurring"
            ;;
        *d\*)
            clean_prefix="${prefix%d*}"
            for ((i=0; i<${#clean_prefix}; i++)); do
                char="${clean_prefix:$i:1}"
                case "$char" in
                    a) decoded="${decoded}Half day AM + " ;;
                    p) decoded="${decoded}Half day PM + " ;;
                    b) decoded="${decoded}Business + " ;;
                    s) decoded="${decoded}Training/course + " ;;
                    i) decoded="${decoded}In office + " ;;
                    *) decoded="${decoded}Unknown($char) + " ;;
                esac
            done
            decoded="${decoded}Weekly recurring"
            ;;
        *)
            for ((i=0; i<${#prefix}; i++)); do
                char="${prefix:$i:1}"
                case "$char" in
                    a) decoded="${decoded}Half day AM + " ;;
                    p) decoded="${decoded}Half day PM + " ;;
                    b) decoded="${decoded}Business + " ;;
                    s) decoded="${decoded}Training/course + " ;;
                    i) decoded="${decoded}In office + " ;;
                    *) decoded="${decoded}Unknown($char) + " ;;
                esac
            done
            decoded="${decoded% + }"
            ;;
    esac

    echo "Prefix: '$prefix'"
    echo "  Meaning: $decoded"
    echo "  Count: $count ($percentage%)"
    echo "  Examples:"

    # Show up to 3 examples
    grep "^$prefix|" "$EXAMPLE_FILE" | head -n 3 | while IFS='|' read p example; do
        echo "    $example"
    done
    echo ""
done

echo "================================================================================"
echo "FLAG MEANINGS"
echo "================================================================================"
echo "  a = Half day AM"
echo "  p = Half day PM"
echo "  b = Business trip / out for work"
echo "  s = Training / course"
echo "  i = In office (override)"
echo ""
echo "Note: Flags can be combined, e.g., 'pb' = Business + Half day PM"
