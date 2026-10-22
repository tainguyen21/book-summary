import { defineMessages } from "../messages";

/** Summary reader: citation locations, quote cards, sources list, ask-this-book copy. */
export const readerMessages = defineMessages(
  {
    locations: {
      page_number: "Page",
      spine_index: "Chapter",
      paragraph_number: "Paragraph",
      line_start: "Line",
    },
    sourcePassage: "Source passage",
    askHeading: "Ask this book",
    askLede: "Answers come only from this book, with the sentence behind each claim.",
    askPlaceholder: "e.g. Why did the first trees die?",
    sourcesTitle: "Where this comes from",
    sourcesLede: "The summary is grounded in these parts of the book. Select one to read it.",
    noSources: "No source locations are available for this summary.",
    showSourceQuotes: (count: number, sources: string) =>
      `Show source quote${count > 1 ? "s" : ""}: ${sources}`,
    sourceItem: (order: number, label: string) => `source ${order}, ${label}`,
    quoteCardLabel: "Source quotes for this sentence",
    fromTheBook: "From the book",
    closeQuotes: "Close source quotes",
    noQuote: "No short quote was recorded for this source.",
    viewInContext: "View in context",
    partsTitle: "Part by part",
    partsLede: (count: number) =>
      `A closer summary of each of the book's ${count} parts, in reading order.`,
    partLabel: (position: number) => `Part ${position}`,
    pageRange: (start: number, end: number) => `Pages ${start}–${end}`,
  },
  {
    locations: {
      page_number: "Trang",
      spine_index: "Chương",
      paragraph_number: "Đoạn",
      line_start: "Dòng",
    },
    sourcePassage: "Đoạn nguồn",
    askHeading: "Hỏi cuốn sách này",
    askLede: "Câu trả lời chỉ lấy từ cuốn sách này, kèm câu văn làm căn cứ cho từng ý.",
    askPlaceholder: "VD: Vì sao những cái cây đầu tiên chết?",
    sourcesTitle: "Nguồn của bản tóm tắt",
    sourcesLede: "Bản tóm tắt dựa trên những phần này của sách. Chọn một phần để đọc.",
    noSources: "Bản tóm tắt này không có vị trí nguồn nào.",
    showSourceQuotes: (_count: number, sources: string) => `Xem trích dẫn nguồn: ${sources}`,
    sourceItem: (order: number, label: string) => `nguồn ${order}, ${label}`,
    quoteCardLabel: "Trích dẫn nguồn của câu này",
    fromTheBook: "Từ cuốn sách",
    closeQuotes: "Đóng trích dẫn nguồn",
    noQuote: "Không có trích dẫn ngắn nào được ghi cho nguồn này.",
    viewInContext: "Xem trong ngữ cảnh",
    partsTitle: "Từng phần",
    partsLede: (count: number) =>
      `Tóm tắt chi tiết hơn cho từng phần trong ${count} phần của sách, theo thứ tự đọc.`,
    partLabel: (position: number) => `Phần ${position}`,
    pageRange: (start: number, end: number) => `Trang ${start}–${end}`,
  },
);
