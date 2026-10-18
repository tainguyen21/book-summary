import { defineMessages } from "../messages";

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

/** Library dashboard: heading, stats, budget, processing panel, collection, and book actions. */
export const libraryMessages = defineMessages(
  {
    // Dashboard heading and states
    loadErrorTitle: "We couldn’t load your library",
    loadErrorBody: "Check your connection, then try again.",
    loading: "Loading your library…",
    introEmpty: "Your private library is ready for its first book.",
    intro: "Here’s what’s happening in your library.",
    liveProcessing: (count: number) =>
      `${count} ${plural(count, "book", "books")} processing · updates live`,
    searchPlaceholder: "Search by title or file name",
    searchLabel: "Search books",
    clearSearch: "Clear search",

    // Empty library
    emptyTitle: "Add your first book",
    emptyBody:
      "Upload a book and Bookwise will read it privately and write a summary with sources you can check.",
    emptyUpload: "Upload a book",
    supportedFormats: "Supported formats",
    sizeLimit: "Up to 100 MB per file",

    // Stats cards
    overview: "Library overview",
    summariesReady: "Summaries ready",
    ofTotal: (total: number) => `of ${total}`,
    legend: { ready: "Ready", processing: "In progress", queued: "Queued", attention: "Attention" },
    readyShare: (percent: number) => `${percent}% of books have a summary ready`,
    usuallyMinutes: "Usually a few minutes",
    nothingRunning: "Nothing running",
    startsAutomatically: "Starts automatically",
    queueClear: "Queue is clear",
    uploadsUnfinished: (count: number) =>
      `${count} ${plural(count, "upload", "uploads")} didn’t finish`,
    couldNotSummarize: (count: number) => `${count} couldn’t be summarized`,
    allGood: "All good",

    // Daily budget strip
    budgetLabel: "Today’s AI spend",
    budgetHeading: "Today’s AI spend:",
    spentOf: (spent: string, cap: string) => `${spent} of ${cap}`,
    budgetUsed: "Share of today’s AI budget used",
    budgetReached: (time: string) => `Budget reached · summaries resume at ${time}`,
    resetsAt: (time: string) => `Resets at ${time}`,

    // Processing-now panel
    processingNow: "Processing now",
    activeCount: (count: number) => `${count} active`,
    refreshes: "Refreshes every few seconds",
    updatedAgo: (when: string) => `updated ${when}`,
    addedAgo: (when: string) => `added ${when}`,
    progressStep: (step: string) => `Progress: ${step}`,
    view: "View",

    // Collection
    sort: { newest: "Newest first", oldest: "Oldest first", title: "Title A–Z" },
    sortLabel: "Sort books",
    layoutLabel: "Layout",
    listView: "List view",
    gridView: "Grid view",
    noMatch: "No books match",
    tryDifferent: "Try a different search or filter.",
    showAll: "Show all books",
    columns: { book: "Book", format: "Format", added: "Added", status: "Status", action: "Action" },
    readSummary: "Read summary",
    uploadAgain: "Upload again",
    viewDetails: "View details",
    viewProgress: "View progress",

    // Book actions menu
    moreActions: (title: string) => `More actions for ${title}`,
    actionsFor: (title: string) => `Actions for ${title}`,
    rename: "Rename",
    retrySummary: "Retry summary",
    delete: "Delete",
    deleteUnavailable: "Available after summarizing finishes",
    retryRequested: "Retry requested. The summary is back in the queue.",
    retryFailed: "Retry failed.",
    deleteTitle: (title: string) => `Delete “${title}”?`,
    deleteBody: "This removes the file and its summary. It can’t be undone.",
    deleteConfirm: "Delete book",

    // Rename dialog
    renameTitle: "Rename book",
    titleLabel: "Title",
    titleLength: (max: number) => `Enter a title of 1–${max} characters.`,

    // Clear incomplete uploads
    clearButton: (count: number) => `Clear incomplete uploads (${count})`,
    clearTitle: (count: number) =>
      `Clear ${count} incomplete ${plural(count, "upload", "uploads")}?`,
    clearBody:
      "These files never finished uploading, so they have no summary. This can’t be undone.",
    clearConfirm: "Clear uploads",
    cleared: (count: number) => `Cleared ${count} incomplete ${plural(count, "upload", "uploads")}.`,
  },
  {
    loadErrorTitle: "Không tải được thư viện của bạn",
    loadErrorBody: "Hãy kiểm tra kết nối rồi thử lại.",
    loading: "Đang tải thư viện của bạn…",
    introEmpty: "Thư viện riêng của bạn đã sẵn sàng cho cuốn sách đầu tiên.",
    intro: "Đây là những gì đang diễn ra trong thư viện của bạn.",
    liveProcessing: (count: number) => `${count} cuốn sách đang xử lý · cập nhật trực tiếp`,
    searchPlaceholder: "Tìm theo tiêu đề hoặc tên tệp",
    searchLabel: "Tìm kiếm sách",
    clearSearch: "Xoá tìm kiếm",

    emptyTitle: "Thêm cuốn sách đầu tiên",
    emptyBody:
      "Tải sách lên, Bookwise sẽ đọc riêng tư và viết bản tóm tắt kèm nguồn để bạn kiểm chứng.",
    emptyUpload: "Tải một cuốn sách lên",
    supportedFormats: "Định dạng được hỗ trợ",
    sizeLimit: "Tối đa 100 MB mỗi tệp",

    overview: "Tổng quan thư viện",
    summariesReady: "Bản tóm tắt sẵn sàng",
    ofTotal: (total: number) => `trên ${total}`,
    legend: { ready: "Sẵn sàng", processing: "Đang xử lý", queued: "Đang chờ", attention: "Cần xử lý" },
    readyShare: (percent: number) => `${percent}% số sách đã có bản tóm tắt`,
    usuallyMinutes: "Thường mất vài phút",
    nothingRunning: "Không có gì đang chạy",
    startsAutomatically: "Tự động bắt đầu",
    queueClear: "Hàng chờ trống",
    uploadsUnfinished: (count: number) => `${count} tệp tải lên chưa xong`,
    couldNotSummarize: (count: number) => `${count} cuốn không tóm tắt được`,
    allGood: "Mọi thứ đều ổn",

    budgetLabel: "Chi phí AI hôm nay",
    budgetHeading: "Chi phí AI hôm nay:",
    spentOf: (spent: string, cap: string) => `${spent} trên ${cap}`,
    budgetUsed: "Phần ngân sách AI hôm nay đã dùng",
    budgetReached: (time: string) =>
      `Đã hết ngân sách hằng ngày · tiếp tục tóm tắt lúc ${time}`,
    resetsAt: (time: string) => `Đặt lại lúc ${time}`,

    processingNow: "Đang xử lý",
    activeCount: (count: number) => `${count} đang chạy`,
    refreshes: "Tự làm mới sau vài giây",
    updatedAgo: (when: string) => `cập nhật ${when}`,
    addedAgo: (when: string) => `thêm ${when}`,
    progressStep: (step: string) => `Tiến độ: ${step}`,
    view: "Xem",

    sort: { newest: "Mới nhất trước", oldest: "Cũ nhất trước", title: "Tiêu đề A–Z" },
    sortLabel: "Sắp xếp sách",
    layoutLabel: "Bố cục",
    listView: "Dạng danh sách",
    gridView: "Dạng lưới",
    noMatch: "Không có sách nào phù hợp",
    tryDifferent: "Hãy thử từ khoá hoặc bộ lọc khác.",
    showAll: "Hiện tất cả sách",
    columns: { book: "Sách", format: "Định dạng", added: "Ngày thêm", status: "Trạng thái", action: "Thao tác" },
    readSummary: "Đọc bản tóm tắt",
    uploadAgain: "Tải lên lại",
    viewDetails: "Xem chi tiết",
    viewProgress: "Xem tiến độ",

    moreActions: (title: string) => `Thêm thao tác cho ${title}`,
    actionsFor: (title: string) => `Thao tác cho ${title}`,
    rename: "Đổi tên",
    retrySummary: "Thử lại bản tóm tắt",
    delete: "Xoá",
    deleteUnavailable: "Có thể dùng sau khi tóm tắt xong",
    retryRequested: "Đã yêu cầu thử lại. Bản tóm tắt đã quay lại hàng chờ.",
    retryFailed: "Thử lại không thành công.",
    deleteTitle: (title: string) => `Xoá “${title}”?`,
    deleteBody: "Thao tác này xoá tệp và bản tóm tắt của nó. Không thể hoàn tác.",
    deleteConfirm: "Xoá sách",

    renameTitle: "Đổi tên sách",
    titleLabel: "Tiêu đề",
    titleLength: (max: number) => `Nhập tiêu đề dài từ 1–${max} ký tự.`,

    clearButton: (count: number) => `Xoá tệp tải lên chưa xong (${count})`,
    clearTitle: (count: number) => `Xoá ${count} tệp tải lên chưa xong?`,
    clearBody:
      "Những tệp này chưa tải lên xong nên chưa có bản tóm tắt. Không thể hoàn tác.",
    clearConfirm: "Xoá tệp tải lên",
    cleared: (count: number) => `Đã xoá ${count} tệp tải lên chưa xong.`,
  },
);
