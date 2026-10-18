import { defineMessages } from "../messages";

/** Browser notifications when a summary is ready. */
export const notificationMessages = defineMessages(
  {
    enable: "Notify me when summaries are ready",
    enabled: "Notifications on",
    disable: "Turn off notifications",
    blocked: "Notifications are blocked in this browser’s settings.",
    readyTitle: "Summary ready",
    readyBody: (title: string) => `“${title}” is ready to read.`,
    readyBodyUntitled: "A book you uploaded is ready to read.",
  },
  {
    enable: "Báo cho tôi khi bản tóm tắt xong",
    enabled: "Đã bật thông báo",
    disable: "Tắt thông báo",
    blocked: "Thông báo đang bị chặn trong cài đặt trình duyệt.",
    readyTitle: "Đã có bản tóm tắt",
    readyBody: (title: string) => `“${title}” đã sẵn sàng để đọc.`,
    readyBodyUntitled: "Một cuốn sách bạn tải lên đã sẵn sàng để đọc.",
  },
);
