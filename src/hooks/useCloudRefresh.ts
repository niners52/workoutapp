/**
 * Pull-to-refresh that pulls edits made outside the phone (configPull.ts)
 * with no throttle, then reloads the app's data.
 */
import { useCallback, useState } from 'react';
import { useData } from '../contexts/DataContext';
import { pullConfigFromCloud } from '../services/configPull';

export function useCloudRefresh(): { refreshing: boolean; onRefresh: () => void } {
  const { refreshAll } = useData();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    pullConfigFromCloud({ force: true })
      .then(() => refreshAll())
      .catch(e => console.log('Pull to refresh failed:', e))
      .finally(() => setRefreshing(false));
  }, [refreshAll]);
  return { refreshing, onRefresh };
}
