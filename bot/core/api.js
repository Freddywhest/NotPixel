const app = require("../config/app");
const logger = require("../utils/logger");
const WebSocket = require("ws");
var _ = require("lodash");
const _isArray = require("../utils/_isArray");

class ApiRequest {
  constructor(session_name, bot_name) {
    this.bot_name = bot_name;
    this.session_name = session_name;
  }

  async get_user_info(http_client) {
    const endpoint = `${app.apiUrl}/api/v1/users/me`;
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 5000; // 1 second

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await http_client.get(endpoint, { timeout: 10000 });
        return response?.data;
      } catch (error) {
        if (error?.response?.status >= 500 && error?.response?.status <= 599) {
          logger.warning(
            `<ye>[${this.bot_name}]</ye> | ${this.session_name} | ⚠️ Server error (${error.response.status}) while getting user info. Attempt ${attempt} of ${MAX_RETRIES}.`
          );
        } else if (error?.response?.data?.error) {
          logger.warning(
            `<ye>[${this.bot_name}]</ye> | ${this.session_name} | ⚠️ Error while getting user info: ${error?.response?.data?.error}`
          );
          break;
        } else {
          logger.error(
            `<ye>[${this.bot_name}]</ye> | ${this.session_name} | Error while getting user info: ${error.message}`
          );
          break;
        }

        // Retry logic for server-side errors
        if (
          attempt < MAX_RETRIES &&
          (error.code === "ECONNABORTED" ||
            (error.response &&
              error.response.status >= 500 &&
              error.response.status <= 599))
        ) {
          await new Promise((res) => setTimeout(res, RETRY_DELAY_MS));
          continue;
        }

        return null;
      }
    }
  }

  async validate_query_id(http_client) {
    const endpoint = `${app.apiUrl}/api/v1/users/me`;
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 5000; // 1 second

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await http_client.get(endpoint, { timeout: 10000 });
        return true;
      } catch (error) {
        // Retry logic for timeouts and server-side errors
        if (
          attempt < MAX_RETRIES &&
          (error.code === "ECONNABORTED" ||
            (error.response &&
              error.response.status >= 500 &&
              error.response.status <= 599))
        ) {
          await new Promise((res) => setTimeout(res, RETRY_DELAY_MS));
          continue;
        }

        return false;
      }
    }
  }

  async get_mine_info(httpClient) {
    const endpoint = `${app.apiUrl}/api/v1/mining/status`;
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 5000; // 1 second

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await httpClient.get(endpoint, { timeout: 10000 }); // Set a timeout of 5 seconds
        return response?.data;
      } catch (error) {
        // Check if the error is a timeout
        if (error.code === "ECONNABORTED") {
          logger.warning(
            `<ye>[${this.bot_name}]</ye> | ${this.session_name} | ⚠️ Request timed out while getting mine info. Attempt ${attempt} of ${MAX_RETRIES}.`
          );
        } else if (error?.response) {
          const status = error.response.status;
          const errorMsg = error.response.data?.error || error.message;

          if (status >= 500 && status <= 599) {
            // Server-side error
            logger.error(
              `<ye>[${this.bot_name}]</ye> | ${this.session_name} | ❌ Server error (${status}) while getting mine info: ${errorMsg}`
            );
          } else {
            // Client-side or other errors
            logger.warning(
              `<ye>[${this.bot_name}]</ye> | ${this.session_name} | ⚠️ Error (${status}) while getting mine info: ${errorMsg}`
            );
            // For client-side errors, no point in retrying
            break;
          }
        } else {
          // Network or other unexpected errors
          logger.error(
            `<ye>[${this.bot_name}]</ye> | ${this.session_name} | ❌ Unexpected error while getting mine info: ${error.message}`
          );
        }

        // Retry for server-side errors and timeouts
        if (
          attempt < MAX_RETRIES &&
          (error.code === "ECONNABORTED" ||
            (error.response &&
              error.response.status >= 500 &&
              error.response.status <= 599))
        ) {
          await new Promise((res) => setTimeout(res, RETRY_DELAY_MS));
          continue;
        }

        // After max retries or non-retriable error, return null
        return null;
      }
    }
  }

  async get_pixels_info() {
    const url = "wss://notpx.app/api/v2/image/ws";
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      let isResolved = false;

      ws.on("open", () => {});

      ws.on("message", (data) => {
        if (isResolved) return;

        const response = data.toString();
        try {
          if (_isArray(response)) {
            const parsedResponse = JSON.parse(response);
            if (parsedResponse && parsedResponse.data) {
              if (!parsedResponse[0].startsWith("pixelUpdate")) {
                isResolved = false;
              } else {
                isResolved = true;
                resolve(parsedResponse.data);
              }
            } else {
              // Если формат неверный, разбиваем ответ на строки и возвращаем
              const responseArr = response.split("\n");
              if (!responseArr[0].startsWith("pixelUpdate")) {
                isResolved = false;
              } else {
                isResolved = true;
                resolve(responseArr);
              }
            }
          } else {
            const responseArr = response.split("\n");
            if (!responseArr[0].startsWith("pixelUpdate")) {
              isResolved = false;
            } else {
              isResolved = true;
              resolve(responseArr);
            }
          }
        } catch (error) {
          if (!isResolved) {
            isResolved = true;
            reject(new Error("WebSocket ошибка: " + error.message));
          }
        } finally {
          ws.close();
        }
      });

      ws.on("error", (error) => {
        if (!isResolved) {
          isResolved = true;
          reject(new Error("WebSocket ошибка: " + error.message));
          ws.close();
        }
      });
    });
  }

  async claim_mine(http_client) {
    const endpoint = `${app.apiUrl}/api/v1/mining/claim`;
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 5000; // 1 second

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await http_client.get(endpoint, { timeout: 10000 });
        return response?.data;
      } catch (error) {
        if (error?.response?.status >= 500 && error?.response?.status <= 599) {
          logger.warning(
            `<ye>[${this.bot_name}]</ye> | ${this.session_name} | ⚠️ Server error (${error.response.status}) while claiming mine. Attempt ${attempt} of ${MAX_RETRIES}.`
          );
        } else if (error?.response?.data?.error) {
          logger.warning(
            `<ye>[${this.bot_name}]</ye> | ${this.session_name} | ⚠️ Error while claiming mine: ${error?.response?.data?.error}`
          );
          break;
        } else {
          logger.error(
            `<ye>[${this.bot_name}]</ye> | ${this.session_name} | Error while claiming mine: ${error.message}`
          );
          break;
        }

        if (
          attempt < MAX_RETRIES &&
          (error.code === "ECONNABORTED" ||
            (error.response &&
              error.response.status >= 500 &&
              error.response.status <= 599))
        ) {
          await new Promise((res) => setTimeout(res, RETRY_DELAY_MS));
          continue;
        }

        return null;
      }
    }
  }

  async claim_task(http_client, task) {
    const endpoint = `${app.apiUrl}/api/v1/mining/task/check/${task}`;
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 5000; // 1 second

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await http_client.get(endpoint, { timeout: 10000 });
        return response?.data;
      } catch (error) {
        if (error?.response?.status >= 500 && error?.response?.status <= 599) {
          logger.warning(
            `<ye>[${this.bot_name}]</ye> | ${this.session_name} | ⚠️ Server error (${error.response.status}) while claiming task. Attempt ${attempt} of ${MAX_RETRIES}.`
          );
        } else if (error?.response?.data?.error) {
          logger.warning(
            `<ye>[${this.bot_name}]</ye> | ${this.session_name} | ⚠️ Error while claiming task: ${error?.response?.data?.error}`
          );
          break;
        } else {
          logger.error(
            `<ye>[${this.bot_name}]</ye> | ${this.session_name} | Error while claiming task: ${error.message}`
          );
          break;
        }

        if (
          attempt < MAX_RETRIES &&
          (error.code === "ECONNABORTED" ||
            (error.response &&
              error.response.status >= 500 &&
              error.response.status <= 599))
        ) {
          await new Promise((res) => setTimeout(res, RETRY_DELAY_MS));
          continue;
        }

        return null;
      }
    }
  }

  async repaint(http_client, paint) {
    const endpoint = `${app.apiUrl}/api/v1/repaint/start`;
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 5000; // 1 second

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await http_client.post(
          endpoint,
          JSON.stringify(paint),
          { timeout: 10000 }
        );
        return response?.data;
      } catch (error) {
        if (error?.response?.status >= 500 && error?.response?.status <= 599) {
          logger.warning(
            `<ye>[${this.bot_name}]</ye> | ${this.session_name} | ⚠️ Server error (${error.response.status}) while repainting. Attempt ${attempt} of ${MAX_RETRIES}.`
          );
        } else if (error?.response?.data?.error) {
          logger.warning(
            `<ye>[${this.bot_name}]</ye> | ${this.session_name} | ⚠️ Error while repainting: ${error?.response?.data?.error}`
          );
          break;
        } else {
          logger.error(
            `<ye>[${this.bot_name}]</ye> | ${this.session_name} | Error while repainting: ${error.message}`
          );
          break;
        }

        if (
          attempt < MAX_RETRIES &&
          (error.code === "ECONNABORTED" ||
            (error.response &&
              error.response.status >= 500 &&
              error.response.status <= 599))
        ) {
          await new Promise((res) => setTimeout(res, RETRY_DELAY_MS));
          continue;
        }

        return null;
      }
    }
  }

  async go_to_page(http_client, page) {
    const endpoint = `${app.pageUrl}/api/event`;
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 5000; // 1 second

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await http_client.post(
          endpoint,
          JSON.stringify({
            n: "pageview",
            u: "https://app.notpx.app" + page,
            d: "notpx.app",
            r: null,
          }),
          { timeout: 10000 }
        );
        return response?.data;
      } catch (error) {
        if (error?.response?.status >= 500 && error?.response?.status <= 599) {
          logger.warning(
            `<ye>[${this.bot_name}]</ye> | ${this.session_name} | ⚠️ Server error (${error.response.status}) while going to page. Attempt ${attempt} of ${MAX_RETRIES}.`
          );
        } else if (error?.response?.data?.error) {
          logger.warning(
            `<ye>[${this.bot_name}]</ye> | ${this.session_name} | ⚠️ Error while viewing page: ${error?.response?.data?.error}`
          );
          break;
        } else {
          logger.error(
            `<ye>[${this.bot_name}]</ye> | ${this.session_name} | Error while viewing page: ${error.message}`
          );
          break;
        }

        if (
          attempt < MAX_RETRIES &&
          (error.code === "ECONNABORTED" ||
            (error.response &&
              error.response.status >= 500 &&
              error.response.status <= 599))
        ) {
          await new Promise((res) => setTimeout(res, RETRY_DELAY_MS));
          continue;
        }

        return null;
      }
    }
  }
}

module.exports = ApiRequest;
