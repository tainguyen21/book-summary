import { defineMessages } from "../messages";

/** Search page: search field, results, and the ask-your-library panel copy. */
export const searchMessages = defineMessages(
  {
    title: "Search your books",
    lede: "Find a fact, quote, or idea across every book you’ve uploaded, even in different words.",
    fieldLabel: "Search inside your books",
    placeholder: "e.g. why did the first trees die?",
    clear: "Clear search",
    askHeading: "Ask your library",
    askLede: "One question, answered from all your books, naming the book behind each claim.",
    askPlaceholder: "e.g. What do my books say about planting in cold climates?",
    hint: (min: number) => `Type at least ${min} characters. Results come from your books only.`,
    searching: "Searching…",
    errorTitle: "Search isn’t available right now",
    errorBody: "Check your connection and try again.",
    summary: (count: number, query: string) =>
      `${count === 0 ? "No matches" : `${count} result${count === 1 ? "" : "s"}`} for “${query}”`,
    keywordBudget: " · keyword matches only: today’s AI budget is used up",
    keywordUnavailable: " · keyword matches only: meaning search is unavailable right now",
    empty: "Try other words, or describe the idea instead of an exact phrase.",
    kindFact: "Fact",
    kindPassage: "Passage",
    viewPassage: "View passage",
  },
  {
    title: "Tìm kiếm trong sách của bạn",
    lede: "Tìm một dữ kiện, trích dẫn hay ý tưởng trong mọi cuốn sách bạn đã tải lên, kể cả khi diễn đạt khác.",
    fieldLabel: "Tìm kiếm trong sách của bạn",
    placeholder: "VD: vì sao những cái cây đầu tiên chết?",
    clear: "Xóa tìm kiếm",
    askHeading: "Hỏi cả thư viện",
    askLede: "Một câu hỏi, trả lời từ tất cả sách của bạn, kèm tên cuốn sách làm căn cứ cho từng ý.",
    askPlaceholder: "VD: Sách của tôi nói gì về việc trồng cây ở vùng lạnh?",
    hint: (min: number) => `Nhập ít nhất ${min} ký tự. Kết quả chỉ lấy từ sách của bạn.`,
    searching: "Đang tìm kiếm…",
    errorTitle: "Hiện chưa thể tìm kiếm",
    errorBody: "Hãy kiểm tra kết nối và thử lại.",
    summary: (count: number, query: string) =>
      `${count === 0 ? "Không có kết quả" : `${count} kết quả`} cho “${query}”`,
    keywordBudget: " · chỉ khớp theo từ khóa: đã dùng hết ngân sách AI hằng ngày",
    keywordUnavailable: " · chỉ khớp theo từ khóa: tìm theo ý nghĩa hiện chưa khả dụng",
    empty: "Hãy thử từ khác, hoặc mô tả ý tưởng thay vì một cụm từ chính xác.",
    kindFact: "Dữ kiện",
    kindPassage: "Đoạn",
    viewPassage: "Xem đoạn",
  },
);
