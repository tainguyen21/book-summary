import type { Locale } from "../locale";
import { defineMessages } from "../messages";

/** BCP 47 tags handed to `Intl` formatters for each interface language. */
export const intlLocales: Record<Locale, string> = { en: "en-US", vi: "vi-VN" };

/** Words shared by several screens (buttons and generic fallbacks). */
export const commonMessages = defineMessages(
  {
    cancel: "Cancel",
    close: "Close",
    retry: "Retry",
    tryAgain: "Try again",
    save: "Save",
    somethingWentWrong: "Something went wrong.",
  },
  {
    cancel: "Huỷ",
    close: "Đóng",
    retry: "Thử lại",
    tryAgain: "Thử lại",
    save: "Lưu",
    somethingWentWrong: "Đã xảy ra lỗi.",
  },
);

/** Relative-day, relative-time, and greeting words used by `lib/format`. */
export const formatMessages = defineMessages(
  {
    today: "Today",
    yesterday: "Yesterday",
    justNow: "just now",
    minutesAgo: (minutes: number) => `${minutes} min ago`,
    hoursAgo: (hours: number) => `${hours} h ago`,
    goodMorning: "Good morning",
    goodAfternoon: "Good afternoon",
    goodEvening: "Good evening",
  },
  {
    today: "Hôm nay",
    yesterday: "Hôm qua",
    justNow: "vừa xong",
    minutesAgo: (minutes: number) => `${minutes} phút trước`,
    hoursAgo: (hours: number) => `${hours} giờ trước`,
    goodMorning: "Chào buổi sáng",
    goodAfternoon: "Chào buổi chiều",
    goodEvening: "Chào buổi tối",
  },
);
