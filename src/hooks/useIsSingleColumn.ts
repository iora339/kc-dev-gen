import { useEffect, useState } from "react";

// ウィンドウ幅がブレークポイント以下の場合、true を返す
// breakpoint: ブレークポイント幅（デフォルト: 850px、1列表示の切り替え境界）
export function useIsSingleColumn(breakpoint = 850): boolean {
  const [isSingleColumn, setIsSingleColumn] = useState(window.innerWidth <= breakpoint);

  useEffect(() => {
    const handleResize = () => setIsSingleColumn(window.innerWidth <= breakpoint);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [breakpoint]);

  return isSingleColumn;
}
