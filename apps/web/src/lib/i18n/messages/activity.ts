import { defineMessages } from "../messages";

/** The activity page: processing runs, queue, and today's spend. */
export const activityMessages = defineMessages(
  {
    nav: "Activity",
    title: "Activity",
    lede: "What Bookwise has been doing with your books: processing runs, the queue, and today’s AI spend.",
    queueTitle: "Queue",
    queueMine: (count: number) =>
      count === 0 ? "Nothing of yours is waiting." : `${count} ${count === 1 ? "job" : "jobs"} of yours waiting or running`,
    queueAhead: (count: number) =>
      count === 0 ? "Yours are next." : `${count} ${count === 1 ? "job" : "jobs"} from other readers ahead`,
    spendTitle: "Today’s AI spend",
    spendNone: "No AI spend from your books today.",
    calls: (count: number) => `${count} ${count === 1 ? "call" : "calls"}`,
    operations: {
      evidence: "Reading evidence",
      summary: "Writing summaries",
      embedding: "Indexing for search",
      query_embedding: "Search queries",
      answer: "Answers",
      evaluation: "Answer evaluation",
      flashcards: "Flashcards",
    } as Record<string, string>,
    runsTitle: "Recent runs",
    runsEmpty: "No processing runs yet. Upload a book to start one.",
    stages: { ingest_book: "Reading the file", regenerate_summary: "Summarizing" } as Record<string, string>,
    statuses: {
      running: "Running",
      completed: "Done",
      retryable_failed: "Will retry",
      permanent_failed: "Failed",
    } as Record<string, string>,
    started: (time: string) => `Started ${time}`,
    took: (duration: string) => `took ${duration}`,
    errors: {
      daily_budget_exceeded: "Paused until today’s AI budget resets.",
      invalid_structured_provider_output: "The model’s reply couldn’t be used. Retry usually fixes it.",
      unsupported_document: "This file couldn’t be read (scanned or protected files often can’t).",
    } as Record<string, string>,
    errorCode: (code: string) => `Error: ${code}`,
    loadError: "Activity couldn’t be loaded. Check your connection and try again.",
    tryAgain: "Try again",
    loading: "Loading activity…",
  },
  {
    nav: "Hoạt động",
    title: "Hoạt động",
    lede: "Bookwise đã làm gì với sách của bạn: các lượt xử lý, hàng chờ và chi phí AI hôm nay.",
    queueTitle: "Hàng chờ",
    queueMine: (count: number) =>
      count === 0 ? "Không có việc nào của bạn đang chờ." : `${count} việc của bạn đang chờ hoặc đang chạy`,
    queueAhead: (count: number) =>
      count === 0 ? "Việc của bạn là tiếp theo." : `${count} việc của người đọc khác đang ở phía trước`,
    spendTitle: "Chi phí AI hôm nay",
    spendNone: "Hôm nay chưa có chi phí AI từ sách của bạn.",
    calls: (count: number) => `${count} lượt gọi`,
    operations: {
      evidence: "Đọc dữ kiện",
      summary: "Viết bản tóm tắt",
      embedding: "Lập chỉ mục tìm kiếm",
      query_embedding: "Truy vấn tìm kiếm",
      answer: "Câu trả lời",
      evaluation: "Đánh giá câu trả lời",
      flashcards: "Thẻ ghi nhớ",
    } as Record<string, string>,
    runsTitle: "Lượt xử lý gần đây",
    runsEmpty: "Chưa có lượt xử lý nào. Hãy tải một cuốn sách lên để bắt đầu.",
    stages: { ingest_book: "Đọc tệp", regenerate_summary: "Tóm tắt" } as Record<string, string>,
    statuses: {
      running: "Đang chạy",
      completed: "Xong",
      retryable_failed: "Sẽ thử lại",
      permanent_failed: "Thất bại",
    } as Record<string, string>,
    started: (time: string) => `Bắt đầu ${time}`,
    took: (duration: string) => `mất ${duration}`,
    errors: {
      daily_budget_exceeded: "Tạm dừng đến khi ngân sách AI hôm nay được đặt lại.",
      invalid_structured_provider_output: "Không dùng được phản hồi của mô hình. Thử lại thường sẽ được.",
      unsupported_document: "Không đọc được tệp này (tệp quét hoặc có bảo vệ thường không đọc được).",
    } as Record<string, string>,
    errorCode: (code: string) => `Lỗi: ${code}`,
    loadError: "Không tải được hoạt động. Hãy kiểm tra kết nối và thử lại.",
    tryAgain: "Thử lại",
    loading: "Đang tải hoạt động…",
  },
);
