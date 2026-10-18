// Letters that occur in Vietnamese but not in English (tone marks and ă â đ ê ô ơ ư).
const VIETNAMESE_LETTERS =
  /[ăâđêôơưàáạảãằắặẳẵầấậẩẫèéẹẻẽềếệểễìíịỉĩòóọỏõồốộổỗờớợởỡùúụủũừứựửữỳýỵỷỹ]/giu;

/**
 * The BCP 47 language of a text when it is clearly not English, so screen
 * readers pronounce it correctly; undefined keeps the page language.
 */
export function textLanguage(text: string): "vi" | undefined {
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  const vietnamese = text.match(VIETNAMESE_LETTERS)?.length ?? 0;
  return letters > 0 && vietnamese / letters > 0.05 ? "vi" : undefined;
}
