import { useEffect, useState } from "react";

// ウィンドウ幅がブレークポイント以下の場合、true を返す
// breakpoint: ブレークポイント幅（デフォルト: 959px。index.css の .main-grid 用 @media (max-width: 959px) と揃える必要がある）
export function useIsSingleColumn(breakpoint = 959): boolean {
  const [isSingleColumn, setIsSingleColumn] = useState(window.innerWidth <= breakpoint);

  useEffect(() => {
    let frame = 0;
    const handleResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setIsSingleColumn(window.innerWidth <= breakpoint));
    };
    window.addEventListener("resize", handleResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", handleResize);
    };
  }, [breakpoint]);

  return isSingleColumn;
}
