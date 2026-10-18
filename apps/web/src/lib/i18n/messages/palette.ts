import { defineMessages } from "../messages";

/** ⌘K quick-find palette. Destination labels come from `shellMessages`. */
export const paletteMessages = defineMessages(
  {
    groups: { books: "Books", actions: "Actions", goTo: "Go to" },
    searchInside: (query: string) => `Search inside books for “${query}”`,
    askLibrary: (query: string) => `Ask your library “${query}”`,
    askHint: "Opens the question, ready to send",
    inputLabel: "Find a book, page, or action",
    placeholder: "Find a book, search inside books, or ask…",
    results: "Results",
    empty: "Nothing matches. Type at least 2 characters to search inside your books.",
    toMove: "to move",
    toOpen: "to open",
  },
  {
    groups: { books: "Sách", actions: "Thao tác", goTo: "Đi tới" },
    searchInside: (query: string) => `Tìm “${query}” trong sách`,
    askLibrary: (query: string) => `Hỏi thư viện của bạn “${query}”`,
    askHint: "Mở câu hỏi, sẵn sàng để gửi",
    inputLabel: "Tìm sách, trang hoặc thao tác",
    placeholder: "Tìm sách, tìm kiếm trong sách hoặc đặt câu hỏi…",
    results: "Kết quả",
    empty: "Không có kết quả phù hợp. Nhập ít nhất 2 ký tự để tìm kiếm trong sách của bạn.",
    toMove: "để di chuyển",
    toOpen: "để mở",
  },
);
