import { useEffect, useRef } from "react";
import { useCreateExpenseCategory, useExpenseCategories } from "./queries";

const DEFAULT_EXPENSE_CATEGORIES: { name: string; hue: number }[] = [
  { name: "Food", hue: 30 },
  { name: "Transport", hue: 200 },
  { name: "Housing", hue: 270 },
  { name: "Entertainment", hue: 320 },
  { name: "Health", hue: 145 },
  { name: "Shopping", hue: 60 },
  { name: "Other", hue: 0 },
];

export function useSeedDefaultExpenseCategories(userId: string | undefined) {
  const q = useExpenseCategories();
  const create = useCreateExpenseCategory();
  const sownRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    if (q.isLoading || q.isFetching) return;
    if (q.data === undefined) return;
    if (q.data.length > 0) return;
    if (sownRef.current === userId) return;
    sownRef.current = userId;

    (async () => {
      for (let i = 0; i < DEFAULT_EXPENSE_CATEGORIES.length; i++) {
        const c = DEFAULT_EXPENSE_CATEGORIES[i];
        try {
          await create.mutateAsync({ name: c.name, hue: c.hue, position: i });
        } catch (err) {
          console.error("Failed to seed expense category", c.name, err);
        }
      }
    })();
  }, [userId, q.data, q.isLoading, q.isFetching, create]);
}
