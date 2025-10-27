import useSWR, { SWRConfiguration, BareFetcher } from 'swr';
import { AxiosError } from 'axios';
import api from '../services/api';

export type ApiError = AxiosError<{ error?: string } | undefined>;

const defaultFetcher: BareFetcher<any> = async (url: string) => {
  const response = await api.get(url);
  return response.data;
};

export function useApiSWR<Data = unknown>(
  key: string | null,
  config?: SWRConfiguration<Data, ApiError>
) {
  return useSWR<Data, ApiError>(key, defaultFetcher, {
    revalidateOnFocus: false,
    ...config,
  });
}

export { defaultFetcher as apiFetcher };
