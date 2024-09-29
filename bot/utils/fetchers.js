const { default: axios } = require("axios");
const _ = require("lodash");
const logger = require("./logger");
const sleep = require("./sleep");
const { Api } = require("telegram");

class Fetchers {
  constructor(api, session_name, bot_name) {
    this.bot_name = bot_name;
    this.session_name = session_name;
    this.api = api;
  }

  async check_proxy(http_client, proxy) {
    try {
      const response = await http_client.get("https://httpbin.org/ip");
      const ip = response.data.origin;
      logger.info(
        `<ye>[${this.bot_name}]</ye> | ${this.session_name} | Proxy IP: ${ip}`
      );
    } catch (error) {
      if (
        error.message.includes("ENOTFOUND") ||
        error.message.includes("getaddrinfo") ||
        error.message.includes("ECONNREFUSED")
      ) {
        logger.error(
          `<ye>[${this.bot_name}]</ye> | ${this.session_name} | Error: Unable to resolve the proxy address. The proxy server at ${proxy.ip}:${proxy.port} could not be found. Please check the proxy address and your network connection.`
        );
        logger.error(
          `<ye>[${this.bot_name}]</ye> | ${this.session_name} | No proxy will be used.`
        );
      } else {
        logger.error(
          `<ye>[${this.bot_name}]</ye> | ${this.session_name} | Proxy: ${proxy.ip}:${proxy.port} | Error: ${error.message}`
        );
      }

      return false;
    }
  }

  #clean_tg_web_data(queryString) {
    let cleanedString = queryString.replace(/^tgWebAppData=/, "");
    cleanedString = cleanedString.replace(
      /&tgWebAppVersion=.*?&tgWebAppPlatform=.*?(?:&tgWebAppBotInline=.*?)?$/,
      ""
    );
    return cleanedString;
  }

  #get_platform(userAgent) {
    const platformPatterns = [
      { pattern: /iPhone/i, platform: "ios" },
      { pattern: /Android/i, platform: "android" },
      { pattern: /iPad/i, platform: "ios" },
    ];

    for (const { pattern, platform } of platformPatterns) {
      if (pattern.test(userAgent)) {
        return platform;
      }
    }

    return "Unknown";
  }

  async join_squad(tg_client, user_agent) {
    try {
      let bot;
      if (!tg_client.connected) {
        await tg_client.connect();
      }
      if (!bot) {
        bot = await tg_client.getInputEntity("notgames_bot");
      }
      const platform = this.#get_platform(user_agent);
      const result = await tg_client.invoke(
        new Api.messages.RequestAppWebView({
          peer: bot,
          app: new Api.InputBotAppShortName({
            botId: bot,
            shortName: "squads",
          }),
          writeAllowed: true,
          platform,
          from_bot_menu: true,
          url: "http://webapp.notcoin.tg",
        })
      );
      await sleep(2);
      const authUrl = result.url;
      const tgWebData = authUrl.split("#", 2)[1];
      if (tgWebData) {
        const webAppData = decodeURIComponent(
          this.#clean_tg_web_data(tgWebData)
        );
        const headers = {
          "Sec-Ch-Ua-Platform": "Android",
          "User-Agent": user_agent,
          "Sec-Ch-Ua-Mobile": "?1",
          "Bypass-Tunnel-Reminder": "x",
          Accept: "*/*",
          Origin: "https://webapp.notcoin.tg",
          "X-Requested-With": "org.telegram.messenger",
          "Sec-Fetch-Site": "same-site",
          "Sec-Fetch-Mode": "cors",
          "Sec-Fetch-Dest": "empty",
          Referer: "https://webapp.notcoin.tg/",
          "Accept-Encoding": "gzip, deflate, br",
          "Accept-Language": "en,en-US;q=0.9",
          Priority: "u=1, i",
          "x-auth-token": "Bearer null",
        };
        const http_client = axios.create({
          headers: headers,
          withCredentials: true,
          baseURL: "https://api.notcoin.tg",
        });

        const access_token = await http_client.post("/auth/login", {
          webAppData,
        });

        await sleep(2);
        if (
          !_.isUndefined(access_token?.data?.data?.accessToken) &&
          !_.isNull(access_token?.data?.data?.accessToken)
        ) {
          http_client.defaults.headers[
            "x-auth-token"
          ] = `Bearer ${access_token?.data?.data?.accessToken}`;

          const squads = await http_client.get("/squads?sort=hot");

          if (!_.isEmpty(squads?.data?.data?.squads)) {
            await sleep(2);
            const squad = _.sample(squads?.data?.data?.squads);

            if (!_.isEmpty(squad)) {
              const res = await fetch(
                `https://api.notcoin.tg/squads/${squad?.status}/join`,
                {
                  method: "POST",
                  headers: {
                    "x-auth-token": `Bearer ${access_token?.data?.data?.accessToken}`,
                    "Sec-Ch-Ua-Platform": "Android",
                    "User-Agent": user_agent,
                    "Sec-Ch-Ua-Mobile": "?1",
                    "Bypass-Tunnel-Reminder": "x",
                    Accept: "*/*",
                    Origin: "https://webapp.notcoin.tg",
                    "X-Requested-With": "org.telegram.messenger",
                    "Sec-Fetch-Site": "same-site",
                    "Sec-Fetch-Mode": "cors",
                    "Sec-Fetch-Dest": "empty",
                    Referer: "https://webapp.notcoin.tg/",
                    "Accept-Encoding": "gzip, deflate, br",
                    "Accept-Language": "en,en-US;q=0.9",
                    Priority: "u=1, i",
                  },
                }
              );
              const response = await res.json();

              if (!_.isEmpty(response?.data)) {
                logger.success(
                  `<ye>[${this.bot_name}]</ye> | ${this.session_name} | Joined the squad: ${squad?.name}`
                );
                return true;
              } else {
                logger.error(
                  `<ye>[${this.bot_name}]</ye> | ${this.session_name} | Error: Unable to join the squad.`
                );
                return false;
              }
            }
          } else {
            logger.error(
              `<ye>[${this.bot_name}]</ye> | ${this.session_name} | 0 Error: Unable to join the squad.`
            );
            return false;
          }
        } else {
          logger.error(
            `<ye>[${this.bot_name}]</ye> | ${this.session_name} | 1 Error: Unable to join the squad.`
          );
          return false;
        }
      } else {
        logger.error(
          `<ye>[${this.bot_name}]</ye> | ${this.session_name} | 2 Error: Unable to join the squad.`
        );
        return false;
      }
    } catch (error) {
      throw error;
    } finally {
      if (tg_client.connected) {
        await tg_client.disconnect();
      }
    }
  }

  randomHex() {
    const hexadecimal = "0_1_2_3_4_5_6_7_8_9_a_b_c_d_e_f".split("_");
    let color = "#";

    for (let i = 0; i < 6; i++) {
      color += hexadecimal[_.random(0, 15)];
    }

    return color;
  }

  randomPosition() {
    return _.random(1, 90_000);
  }
}

module.exports = Fetchers;
