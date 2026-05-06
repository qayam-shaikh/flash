import http from 'k6/http';
import { check, sleep } from 'k6';

const vus = Number(__ENV.VUS || 20);
const targetUrl = __ENV.TARGET_URL || 'http://127.0.0.1:30080';
const quantity = Number(__ENV.QUANTITY || 1);

http.setResponseCallback(http.expectedStatuses({ min: 200, max: 399 }, 409));

export const options = {
  stages: [
    { duration: __ENV.RAMP_UP || '45s', target: vus },
    { duration: __ENV.HOLD || '8m', target: vus },
    { duration: __ENV.RAMP_DOWN || '20s', target: 0 }
  ],
  thresholds: {
    http_req_failed: ['rate<0.35']
  }
};

export default function () {
  const productId = (__ITER % 5) + 1;
  const response = http.post(
    `${targetUrl}/buy`,
    JSON.stringify({ product_id: productId, quantity }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  check(response, {
    'order accepted or stock exhausted': (res) => res.status === 201 || res.status === 409
  });
  sleep(0.1);
}
