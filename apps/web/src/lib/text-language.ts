// Letters that occur in Vietnamese but not in English (tone marks and ă â đ ê ô ơ ư).
const VIETNAMESE_LETTERS =
  /[ăâđêôơưàáạảãằắặẳẵầấậẩẫèéẹẻẽềếệểễìíịỉĩòóọỏõồốộổỗờớợởỡùúụủũừứựửữỳýỵỷỹ]/giu;

/**
 * The BCP 47 language of book text (Bookwise books are English or Vietnamese),
 * so screen readers pronounce it correctly whatever the interface language.
 */
export function textLanguage(text: string): "vi" | "en" {
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  const vietnamese = text.match(VIETNAMESE_LETTERS)?.length ?? 0;
  return letters > 0 && vietnamese / letters > 0.05 ? "vi" : "en";
}
