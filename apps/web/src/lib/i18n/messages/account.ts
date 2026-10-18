import { defineMessages } from "../messages";

export const accountMessages = defineMessages(
  {
    signedIn: "Signed in",
    signOut: "Sign out",
    signOutAccount: (email: string) => `Sign out ${email}`,
    signedInAs: (email: string) => `Signed in as ${email} — sign out`,
    language: "Language",
    switchLanguage: "Tiếng Việt",
    switchLanguageLabel: "Chuyển giao diện sang tiếng Việt",
  },
  {
    signedIn: "Đã đăng nhập",
    signOut: "Đăng xuất",
    signOutAccount: (email: string) => `Đăng xuất ${email}`,
    signedInAs: (email: string) => `Đang đăng nhập bằng ${email} — đăng xuất`,
    language: "Ngôn ngữ",
    switchLanguage: "English",
    switchLanguageLabel: "Switch the interface to English",
  },
);
