import { defineMessages } from "../messages";

/** Why an answer failed; chosen on the client so the text follows the interface language. */
export type AskFailure = "budget" | "unavailable" | "invalid" | "notFound" | "connection" | "generic";

/** The ask panel shared by the book page and the library search page. */
export const askMessages = defineMessages(
  {
    ask: "Ask",
    notFound: "This book doesn’t seem to answer that. Try asking about something it covers.",
    notFoundLibrary: "Your books don’t seem to answer that. Try asking about something they cover.",
    thinking: "Reading the book…",
    answeredEarlier: "Answered earlier · instant",
    answerReady: "Answer ready",
    showSource: (n: number, label: string) => `Show source ${n}: ${label}`,
    source: (n: number) => `Source ${n}`,
    closeSource: "Close source",
    noQuote: "No short quote was recorded for this passage.",
    viewInContext: "View in context",
    failures: {
      budget: "Today’s AI budget is used up. Asking resumes after midnight; earlier answers still open.",
      unavailable: "The answer couldn’t be generated right now. Try again.",
      invalid: "Ask a question of 3 to 500 characters.",
      notFound: "There’s nothing to ask yet. Questions need at least one finished summary.",
      connection: "Bookwise could not connect. Please try again.",
      generic: "Something went wrong. Please try again.",
    } satisfies Record<AskFailure, string>,
  },
  {
    ask: "Hỏi",
    notFound: "Có vẻ cuốn sách này không trả lời được câu hỏi đó. Hãy hỏi về nội dung mà sách đề cập.",
    notFoundLibrary: "Có vẻ các cuốn sách của bạn không trả lời được câu hỏi đó. Hãy hỏi về nội dung mà sách đề cập.",
    thinking: "Đang đọc sách…",
    answeredEarlier: "Đã trả lời trước đó · tức thì",
    answerReady: "Đã có câu trả lời",
    showSource: (n: number, label: string) => `Xem nguồn ${n}: ${label}`,
    source: (n: number) => `Nguồn ${n}`,
    closeSource: "Đóng nguồn",
    noQuote: "Không có trích dẫn ngắn nào được ghi cho đoạn này.",
    viewInContext: "Xem trong ngữ cảnh",
    failures: {
      budget:
        "Đã dùng hết ngân sách AI hằng ngày. Bạn có thể hỏi tiếp sau nửa đêm; các câu trả lời trước vẫn mở được.",
      unavailable: "Hiện chưa thể tạo câu trả lời. Hãy thử lại.",
      invalid: "Hãy đặt câu hỏi dài từ 3 đến 500 ký tự.",
      notFound: "Chưa có gì để hỏi. Cần ít nhất một bản tóm tắt đã hoàn tất.",
      connection: "Không thể kết nối với Bookwise. Vui lòng thử lại.",
      generic: "Đã xảy ra lỗi. Vui lòng thử lại.",
    },
  },
);
