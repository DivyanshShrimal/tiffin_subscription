import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || '';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
});

// Attach JWT on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

/* ---- Auth ---- */
export const register = (data) => api.post('/api/auth/register', data);
export const login = (data) => api.post('/api/auth/login', data);
export const getMe = () => api.get('/api/auth/me');

/* ---- Customers ---- */
export const getCustomers = (params) => api.get('/api/customers', { params });
export const createCustomer = (data) => api.post('/api/customers', data);
export const getCustomer = (id) => api.get(`/api/customers/${id}`);
export const updateCustomer = (id, data) => api.put(`/api/customers/${id}`, data);
export const deleteCustomer = (id) => api.delete(`/api/customers/${id}`);
export const searchByPhone = (phone) => api.get('/api/customers/search', { params: { phone } });

/* ---- Subscriptions ---- */
export const subscribe = (customerId, data) => api.post(`/api/customers/${customerId}/subscribe`, data);
export const pauseSubscription = (customerId, data) => api.post(`/api/customers/${customerId}/pause`, data);
export const resumeSubscription = (customerId) => api.post(`/api/customers/${customerId}/resume`);
export const getStatus = (customerId) => api.get(`/api/customers/${customerId}/status`);
export const transferSubscription = (subscriptionId, data) => api.post(`/api/subscriptions/${subscriptionId}/transfer`, data);

/* ---- Billing ---- */
export const getBill = (customerId, month) => api.get(`/api/customers/${customerId}/bill`, { params: { month } });

/* ---- T1 Notifications ---- */
export const triggerClock = (date) => api.post('/api/clock', { date });
export const getOutbox = (params) => api.get('/api/outbox', { params });

/* ---- T4 Import ---- */
export const importCustomers = (csvText) =>
  api.post('/api/customers/import', { csv: csvText }, {
    headers: { 'Content-Type': 'application/json' },
  });

export default api;
