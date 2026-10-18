import { flagUrl } from "../lib/identity";
export default function Flag({ cc }: { cc: string }) {
  const url = flagUrl(cc);
  return url ? <img className="flag" src={url} alt={cc} width={18} height={13} loading="lazy" /> : null;
}
