import { getBabyInfo } from "@/features/baby/queries";
import { BabyLinkBoard } from "@/features/baby-care/components/baby-link-board";
import { BabyTabs } from "@/features/baby-care/components/baby-tabs";
import { listBabyLinks } from "@/features/baby-care/queries";

// 사이트를 읽고 AI 설명을 만드는 데 몇 초 걸린다
export const maxDuration = 60;

/** 아기 링크 모음 (가족 공용): 주소를 넣으면 사이트 설명을 붙이고, 누르면 그 사이트로 */
export default async function BabyLinksPage() {
  const [baby, links] = await Promise.all([getBabyInfo(), listBabyLinks()]);
  return (
    <>
      <div className="space-y-2">
        <h1 className="page-title">{baby.name ? `${baby.name} 링크` : "링크"}</h1>
        <BabyTabs active="links" />
      </div>
      <BabyLinkBoard initial={links} />
    </>
  );
}
