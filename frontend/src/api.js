import axios from 'axios';

const key = 'bug-hit-session';
export const token = () => sessionStorage.getItem(key);
export function storeToken(value) {
  if (value) sessionStorage.setItem(key, value);
  else sessionStorage.removeItem(key);
}

export const api = axios.create({ baseURL: '/api', timeout: 20000 });
api.interceptors.request.use((request) => {
  const current = token();
  if (current) request.headers.set('Authorization', `Bearer ${current}`);
  return request;
});
api.interceptors.response.use((result) => result, (error) => {
  if (error.response?.status === 401 && error.config?.headers?.get('Authorization') === `Bearer ${token()}` && token()) {
    storeToken(null);
    window.dispatchEvent(new Event('bug-hit-session-ended'));
  }
  return Promise.reject(error);
});

export function errorText(error) {
  if (error.response?.data?.detail) return error.response.data.detail;
  if (error.response?.status === 404) return 'That item is unavailable.';
  if (error.response?.status === 403) return 'You do not have permission for this action.';
  if (!error.response) return 'Bug Hit could not reach the server. Try again.';
  return 'Something went wrong. Try again.';
}
