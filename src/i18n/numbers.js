/**
 * Spell-out numbers for SR-specific strings so NVDA reads them in
 * the voice's native phonetic system instead of splicing "3" (as a
 * digit token) with a localised counter word. Used for short ranges
 * (0-30) covering durations that appear in live regions / aria labels.
 */
const NUMBERS = {
    en: [
        'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
        'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen',
        'eighteen', 'nineteen', 'twenty', 'twenty-one', 'twenty-two', 'twenty-three',
        'twenty-four', 'twenty-five', 'twenty-six', 'twenty-seven', 'twenty-eight',
        'twenty-nine', 'thirty',
    ],
    'zh-TW': [
        '零', '一', '二', '三', '四', '五', '六', '七', '八', '九',
        '十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九',
        '二十', '二十一', '二十二', '二十三', '二十四', '二十五', '二十六', '二十七',
        '二十八', '二十九', '三十',
    ],
    'zh-CN': [
        '零', '一', '二', '三', '四', '五', '六', '七', '八', '九',
        '十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九',
        '二十', '二十一', '二十二', '二十三', '二十四', '二十五', '二十六', '二十七',
        '二十八', '二十九', '三十',
    ],
    ja: [
        '零', '一', '二', '三', '四', '五', '六', '七', '八', '九',
        '十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九',
        '二十', '二十一', '二十二', '二十三', '二十四', '二十五', '二十六', '二十七',
        '二十八', '二十九', '三十',
    ],
};

export function secondsToWord(n, locale) {
    const table = NUMBERS[locale] || NUMBERS.en;
    if (n >= 0 && n < table.length) return table[n];
    return String(n);
}
