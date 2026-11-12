import { redirect } from "next/navigation";

/** 가족 초대는 '공유' 메뉴로 옮겼다 (예전 주소로 들어와도 그쪽으로) */
export default function FamilySettingsPage() {
  redirect("/share-settings#family");
}
