import { useEffect, useRef } from "react";
import { DEFAULT_CATEGORIES } from "./categoryColor";
import { useCategories, useCreateCategory } from "./queries";

/** Seeds the 7 default categories on first login. Runs once per session
 *  per user, only when listCategories() returns an empty array. */
export function useSeedDefaultCategories(userId: string | undefined) {
  const categoriesQ = useCategories();
  const createCategory = useCreateCategory();
  const sownRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    if (categoriesQ.isLoading || categoriesQ.isFetching) return;
    if (categoriesQ.data === undefined) return;
    if (categoriesQ.data.length > 0) return;
    if (sownRef.current === userId) return;
    sownRef.current = userId;

    (async () => {
      for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
        const c = DEFAULT_CATEGORIES[i];
        try {
          await createCategory.mutateAsync({
            name: c.name,
            hue: c.hue,
            position: i,
          });
        } catch (err) {
          console.error("Failed to seed category", c.name, err);
        }
      }
    })();
  }, [userId, categoriesQ.data, categoriesQ.isLoading, categoriesQ.isFetching, createCategory]);
}
