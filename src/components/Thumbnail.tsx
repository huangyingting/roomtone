import type { CatalogItem } from "@/lib/catalog";
import { useId } from "react";

export default function Thumbnail({ item }: { item: CatalogItem }) {
  const { shape, color } = item;
  const shadeId = useId();
  let drawing: React.ReactNode;
  if (shape === "sofa" || shape === "chair" || shape === "bed") {
    drawing = <><path d="m25 54 47 12 27-20-47-11Z" fill={color} /><path d="m25 54 47 12v13L25 67Z" fill={color} filter={`url(#${shadeId})`} /><path d="m72 66 27-20v13L72 79Z" fill={color} filter={`url(#${shadeId})`} /><path d="m26 40 45 12 27-19-45-11Z" fill={color} /><path d="m26 40 45 12v13L26 53Z" fill={color} />{shape === "bed" ? <><path d="m42 40 14 3 9-6-14-4Z" fill="#faf6eb" /><path d="m60 44 14 4 10-7-15-4Z" fill="#faf6eb" /></> : <><path d="m40 40 10 2v12l-10-3Z" fill="#ab9c72" /><path d="m64 46 10 2v12l-10-3Z" fill="#929f84" /></>}<path d="M31 68v7m59-11v7m-20 9v5" stroke="#795e47" strokeWidth="3" /></>;
  } else if (["plant", "tree", "hedge", "flowers"].includes(shape)) {
    drawing = <><path d="m48 59 7 23h20l7-23Z" fill={shape === "tree" ? "#9b8260" : "#b58f71"} /><path d="M65 65V27" stroke="#887252" strokeWidth="5" /><ellipse cx="65" cy="33" rx={shape === "hedge" ? 33 : 24} ry="25" fill={color} /><ellipse cx="51" cy="33" rx="14" ry="19" fill="#71895c" /><ellipse cx="73" cy="24" rx="16" ry="14" fill="#8b9e71" />{shape === "flowers" && <g fill="#dcb496"><circle cx="52" cy="28" r="5" /><circle cx="71" cy="35" r="5" /><circle cx="64" cy="21" r="5" /></g>}</>;
  } else if (shape === "lamp") {
    drawing = <><ellipse cx="65" cy="81" rx="18" ry="5" fill="#5e6256" /><path d="M65 80V30" stroke="#665f50" strokeWidth="3" /><path d="m45 35 8-22h24l8 22Z" fill={color} /><ellipse cx="65" cy="35" rx="20" ry="6" fill="#e5d6b3" /></>;
  } else if (shape === "rug" || shape === "pool" || shape === "deck") {
    drawing = <><path d="m19 59 45 17 46-32-46-16Z" fill={color} stroke="#d9cbb1" strokeWidth="4" /><path d="m27 58 37 13 38-26-38-13Z" fill="none" stroke="#ffffff" strokeOpacity=".35" strokeWidth="2" />{shape !== "pool" && <path d="m40 51 46 17M51 43l45 17M63 35l44 16" stroke="#8c795e" strokeOpacity=".3" />}</>;
  } else if (shape === "table" || shape === "counter" || shape === "sink" || shape === "tub") {
    drawing = <><path d="m27 42 44 12 29-20-45-12Z" fill={color} /><path d="m27 42 44 12v8L27 50Z" fill={color} filter={`url(#${shadeId})`} /><path d="m71 54 29-20v8L71 62Z" fill={color} filter={`url(#${shadeId})`} /><path d="M34 50v24m37-14v24m21-41v23" stroke="#8c7359" strokeWidth={shape === "counter" ? "13" : "5"} />{(shape === "sink" || shape === "tub") && <ellipse cx="64" cy="39" rx="19" ry="9" fill="#7f9995" />}</>;
  } else if (shape === "car") {
    drawing = <><path d="m22 54 7-17 18-3 12-16 30 8 15 23-8 15-44 10Z" fill={color} /><path d="m48 36 14-14 22 7 8 14-27 2Z" fill="#546a6c" /><ellipse cx="38" cy="63" rx="8" ry="11" fill="#474b46" /><ellipse cx="90" cy="61" rx="8" ry="11" fill="#474b46" /></>;
  } else if (shape === "fence" || shape === "stairs") {
    drawing = <><path d="m27 72 70-31M27 57l70-31M27 42l70-31" stroke={color} strokeWidth="7" /><path d="M31 34v48m31-63v49m32-65v49" stroke="#8b755a" strokeWidth="5" /></>;
  } else {
    drawing = <><path d="m35 23 33 9 24-16-33-8Z" fill={color} /><path d="m35 23 33 9v51l-33-9Z" fill={color} /><path d="m68 32 24-16v51L68 83Z" fill={color} filter={`url(#${shadeId})`} /><path d="M40 39 63 45m-23 7 23 6m-23 7 23 6" stroke="#8d785d" strokeOpacity=".5" strokeWidth="2" />{shape === "shelf" && <path d="M46 30v9m7-8v10m5-8v10M47 49v8m9-6v9" stroke="#77846c" strokeWidth="5" />}</>;
  }
  return <svg className="thumbnail" viewBox="0 0 130 100" aria-hidden="true"><defs><filter id={shadeId}><feColorMatrix type="saturate" values=".8" /><feComponentTransfer><feFuncR type="linear" slope=".82" /><feFuncG type="linear" slope=".82" /><feFuncB type="linear" slope=".82" /></feComponentTransfer></filter></defs><ellipse cx="65" cy="83" rx="42" ry="7" fill="#75694c" opacity=".08" />{drawing}</svg>;
}
