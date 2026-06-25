import { useEffect, useState } from "react";
import { api } from "./api";
import type { Master } from "./types";

// カテゴリ・保管場所の一覧を取得するフック（資産フォーム/フィルタで再利用）。
export function useMasters() {
  const [categories, setCategories] = useState<Master[]>([]);
  const [locations, setLocations] = useState<Master[]>([]);

  async function reload() {
    const [c, l] = await Promise.all([
      api<Master[]>("/categories"),
      api<Master[]>("/locations"),
    ]);
    setCategories(c);
    setLocations(l);
  }

  useEffect(() => {
    reload();
  }, []);

  return { categories, locations, reload };
}
