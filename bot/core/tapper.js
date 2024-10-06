const { default: axios } = require("axios");
const logger = require("../utils/logger");
const headers = require("./header");
const { Api } = require("telegram");
const { HttpsProxyAgent } = require("https-proxy-agent");
const settings = require("../config/config");
const app = require("../config/app");
const user_agents = require("../config/userAgents");
const fs = require("fs");
const sleep = require("../utils/sleep");
const ApiRequest = require("./api");
var _ = require("lodash");
const parser = require("../utils/parser");
const path = require("path");
const taskFilter = require("../utils/taskFilter");
const _isArray = require("../utils/_isArray");
const FdyTmp = require("fdy-tmp");
const Fetchers = require("../utils/fetchers");

class Tapper {
  constructor(tg_client) {
    this.bot_name = "notpixel";
    this.session_name = tg_client.session_name;
    this.tg_client = tg_client.tg_client;
    this.session_user_agents = this.#load_session_data();
    this.headers = { ...headers, "user-agent": this.#get_user_agent() };
    this.api = new ApiRequest(this.session_name, this.bot_name);
    this.sleep_floodwait = 0;
    this.runOnce = false;
  }

  #load_session_data() {
    try {
      const filePath = path.join(process.cwd(), "session_user_agents.json");
      const data = fs.readFileSync(filePath, "utf8");
      return JSON.parse(data);
    } catch (error) {
      if (error.code === "ENOENT") {
        return {};
      } else {
        throw error;
      }
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

  #get_random_user_agent() {
    const randomIndex = Math.floor(Math.random() * user_agents.length);
    return user_agents[randomIndex];
  }

  #get_user_agent() {
    if (this.session_user_agents[this.session_name]) {
      return this.session_user_agents[this.session_name];
    }

    logger.info(
      `<ye>[${this.bot_name}]</ye> | ${this.session_name} | Generating new user agent...`
    );
    const newUserAgent = this.#get_random_user_agent();
    this.session_user_agents[this.session_name] = newUserAgent;
    this.#save_session_data(this.session_user_agents);
    return newUserAgent;
  }

  #save_session_data(session_user_agents) {
    const filePath = path.join(process.cwd(), "session_user_agents.json");
    fs.writeFileSync(filePath, JSON.stringify(session_user_agents, null, 2));
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

  #proxy_agent(proxy) {
    try {
      if (!proxy) return null;
      let proxy_url;
      if (!proxy.password && !proxy.username) {
        proxy_url = `${proxy.protocol}://${proxy.ip}:${proxy.port}`;
      } else {
        proxy_url = `${proxy.protocol}://${proxy.username}:${proxy.password}@${proxy.ip}:${proxy.port}`;
      }
      return new HttpsProxyAgent(proxy_url);
    } catch (e) {
      logger.error(
        `<ye>[${this.bot_name}]</ye> | ${
          this.session_name
        } | Proxy agent error: ${e}\nProxy: ${JSON.stringify(proxy, null, 2)}`
      );
      return null;
    }
  }

  async #get_tg_web_data() {
    try {
      const tmp = new FdyTmp({
        fileName: `${this.bot_name}.fdy.tmp`,
        tmpPath: path.join(process.cwd(), "cache/queries"),
      });
      if (tmp.hasJsonElement(this.session_name)) {
        const queryStringFromCache = tmp.getJson(this.session_name);
        if (!_.isEmpty(queryStringFromCache)) {
          this.headers["authorization"] = `initData ${queryStringFromCache}`;
          const va_hc = axios.create({
            headers: this.headers,
            withCredentials: true,
          });

          const validate = await this.api.validate_query_id(va_hc);

          if (validate) {
            logger.info(
              `<ye>[${this.bot_name}]</ye> | ${this.session_name} | 🔄 Getting data from cache...`
            );
            if (this.tg_client.connected) {
              await this.tg_client.disconnect();
              await this.tg_client.destroy();
            }
            await sleep(5);
            return queryStringFromCache;
          } else {
            tmp.deleteJsonElement(this.session_name);
          }
        }
      }
      await this.tg_client.connect();
      await this.tg_client.start();
      const platform = this.#get_platform(this.#get_user_agent());

      if (!this.bot) {
        this.bot = await this.tg_client.getInputEntity(app.bot);
      }

      if (!this.runOnce) {
        logger.info(
          `<ye>[${this.bot_name}]</ye> | ${this.session_name} | 📡 Waiting for authorization...`
        );
        const botHistory = await this.tg_client.invoke(
          new Api.messages.GetHistory({
            peer: this.bot,
            limit: 10,
          })
        );
        if (botHistory.messages.length < 1) {
          await this.tg_client.invoke(
            new Api.messages.SendMessage({
              message: "/start",
              silent: true,
              noWebpage: true,
              peer: this.bot,
            })
          );
        }
      }

      await sleep(5);

      const result = await this.tg_client.invoke(
        new Api.messages.RequestAppWebView({
          peer: this.bot,
          app: new Api.InputBotAppShortName({
            botId: this.bot,
            shortName: "app",
          }),
          writeAllowed: true,
          platform,
          from_bot_menu: true,
          url: app.webviewUrl,
          startParam: "f1167045062",
        })
      );

      const authUrl = result.url;
      const tgWebData = authUrl.split("#", 2)[1];
      logger.info(
        `<ye>[${this.bot_name}]</ye> | ${this.session_name} | 💾 Storing data in cache...`
      );

      await sleep(5);

      tmp
        .addJson(
          this.session_name,
          decodeURIComponent(this.#clean_tg_web_data(tgWebData))
        )
        .save();
      return decodeURIComponent(this.#clean_tg_web_data(tgWebData));
    } catch (error) {
      if (error.message.includes("AUTH_KEY_DUPLICATED")) {
        logger.error(
          `<ye>[${this.bot_name}]</ye> | ${this.session_name} | The same authorization key (session file) was used in more than one place simultaneously. You must delete your session file and create a new session`
        );
        return null;
      }
      const regex = /A wait of (\d+) seconds/;
      if (
        error.message.includes("FloodWaitError") ||
        error.message.match(regex)
      ) {
        const match = error.message.match(regex);

        if (match) {
          this.sleep_floodwait =
            new Date().getTime() / 1000 + parseInt(match[1], 10) + 10;
        } else {
          this.sleep_floodwait = new Date().getTime() / 1000 + 50;
        }
        logger.error(
          `<ye>[${this.bot_name}]</ye> | ${
            this.session_name
          } | Some flood error, waiting ${
            this.sleep_floodwait - new Date().getTime() / 1000
          } seconds to try again...`
        );
      } else {
        logger.error(
          `<ye>[${this.bot_name}]</ye> | ${this.session_name} | ❗️Unknown error during Authorization: ${error}`
        );
      }
      return null;
    } finally {
      if (this.tg_client.connected) {
        await this.tg_client.disconnect();
        await this.tg_client.destroy();
      }
      this.runOnce = true;
      if (this.sleep_floodwait > new Date().getTime() / 1000) {
        await sleep(this.sleep_floodwait - new Date().getTime() / 1000);
        return await this.#get_tg_web_data();
      }
      await sleep(3);
    }
  }

  async run(proxy) {
    let http_client;
    let access_token_created_time = 0;

    let profile_data;
    let mine_data;

    const fetchers = new Fetchers(this.api, this.session_name, this.bot_name);

    if (
      (settings.USE_PROXY_FROM_TXT_FILE || settings.USE_PROXY_FROM_JS_FILE) &&
      proxy
    ) {
      http_client = axios.create({
        httpsAgent: this.#proxy_agent(proxy),
        headers: this.headers,
        withCredentials: true,
      });
      const proxy_result = await fetchers.check_proxy(http_client, proxy);
      if (!proxy_result) {
        http_client = axios.create({
          headers: this.headers,
          withCredentials: true,
        });
      }
    } else {
      http_client = axios.create({
        headers: this.headers,
        withCredentials: true,
      });
    }
    while (true) {
      try {
        const currentTime = _.floor(Date.now() / 1000);
        if (currentTime - access_token_created_time >= 1800) {
          const tg_web_data = await this.#get_tg_web_data();

          if (
            _.isNull(tg_web_data) ||
            _.isUndefined(tg_web_data) ||
            !tg_web_data ||
            _.isEmpty(tg_web_data)
          ) {
            continue;
          }

          http_client.defaults.headers[
            "authorization"
          ] = `initData ${tg_web_data}`;

          access_token_created_time = currentTime;

          await sleep(2);
        }

        profile_data = await this.api.get_user_info(http_client);

        if (_.isEmpty(profile_data)) {
          access_token_created_time = 0;
          continue;
        }

        if (_.isNull(profile_data?.squad?.id) && settings.AUTO_JOIN_SQUAD) {
          await sleep(2);
          logger.info(
            `<ye>[${this.bot_name}]</ye> | ${this.session_name} | Joining squad...`
          );
          await fetchers.join_squad(this.tg_client, this.#get_user_agent());
          await sleep(3);
        }

        mine_data = await this.api.get_mine_info(http_client);
        await sleep(3);
        profile_data = await this.api.get_user_info(http_client);

        if (_.isEmpty(profile_data)) {
          continue;
        }

        if (_.lte(mine_data?.maxMiningTime, mine_data?.fromStart)) {
          const claim = await this.api.claim_mine(http_client);
          if (!_.isEmpty(claim)) {
            logger.success(
              `<ye>[${this.bot_name}]</ye> | ${this.session_name} | Claimed mine!`
            );
          }
        } else {
          logger.info(
            `<ye>[${this.bot_name}]</ye> | ${
              this.session_name
            } | Mining time left: <la>${
              mine_data?.maxMiningTime - mine_data?.fromStart
            } seconds</la>`
          );
        }
        await sleep(3);
        logger.info(
          `<ye>[${this.bot_name}]</ye> | ${this.session_name} | Balance: <la>${mine_data?.userBalance}PX</la>`
        );

        if (
          (!mine_data?.tasks.hasOwnProperty("x:notcoin") ||
            !mine_data?.tasks.hasOwnProperty("joinSquad") ||
            !mine_data?.tasks.hasOwnProperty("makePixelAvatar") ||
            !mine_data?.tasks.hasOwnProperty("x:notpixel")) &&
          settings.AUTO_CLAIM_TASKS == true
        ) {
          const tasks = [
            "x:notcoin",
            "x:notpixel",
            "joinSquad",
            "makePixelAvatar",
          ];
          let task_data;
          for (let i = 0; i < tasks.length; i++) {
            const ran_sleep = _.random(
              settings.DELAY_BETWEEN_TASKS[0],
              settings.DELAY_BETWEEN_TASKS[1]
            );
            logger.info(
              `<ye>[${this.bot_name}]</ye> | ${this.session_name} | Sleeping for ${ran_sleep} seconds before claiming tasks <la>${tasks[i]}</la>`
            );
            await sleep(ran_sleep);
            const task = tasks[i];
            if (mine_data?.tasks.hasOwnProperty(task)) {
              continue;
            }
            if (_.isNull(profile_data?.squad?.id) && task == "joinSquad") {
              continue;
            }
            task_data = await this.api.claim_task(
              http_client,
              task.includes("x") ? `x?name=${task?.split(":")[1]}` : task
            );
            if (
              task == "makePixelAvatar" &&
              task_data?.makePixelAvatar == false
            ) {
              task_data = await this.api.claim_task(
                http_client,
                task.includes("x") ? `x?name=${task?.split(":")[1]}` : task
              );
            }
            if (!_.isEmpty(task_data)) {
              logger.success(
                `<ye>[${this.bot_name}]</ye> | ${this.session_name} | Claimed <pi>${task}</pi>`
              );
            }
          }

          await sleep(3);

          if (settings.AUTO_PAINT == true) {
            let paintCount = 0;
            while (_.gt(mine_data?.charges, 0) && _.lt(paintCount, 10)) {
              const ran_sleep = _.random(
                settings.DELAY_BETWEEN_PAINTING[0],
                settings.DELAY_BETWEEN_PAINTING[1]
              );
              logger.info(
                `<ye>[${this.bot_name}]</ye> | ${this.session_name} | Sleeping for ${ran_sleep} seconds before painting...`
              );
              await sleep(ran_sleep);
              logger.info(
                `<ye>[${this.bot_name}]</ye> | ${this.session_name} | Painting left <la>${mine_data?.charges} charges</la>`
              );
              const hex = fetchers.randomHex();
              const position = fetchers.randomPosition();
              const repaint = await this.api.repaint(http_client, {
                newColor: hex,
                pixelId: position,
              });

              if (!_.isEmpty(repaint)) {
                logger.success(
                  `<ye>[${this.bot_name}]</ye> | ${this.session_name} | 💰 Painted pixel | Color: <la>${hex}</la>`
                );
              }
              paintCount++;
              mine_data = await this.api.get_mine_info(http_client);
            }
          }
          await sleep(3);

          logger.info(
            `<ye>[${this.bot_name}]</ye> | ${this.session_name} | Balance: <la>${mine_data?.userBalance}PX</la>`
          );
        }
      } catch (error) {
        logger.error(
          `<ye>[${this.bot_name}]</ye> | ${this.session_name} | ❗️Unknown error: ${error}`
        );
      } finally {
        let ran_sleep;
        if (_isArray(settings.SLEEP_BETWEEN_REQUESTS)) {
          if (
            _.isInteger(settings.SLEEP_BETWEEN_REQUESTS[0]) &&
            _.isInteger(settings.SLEEP_BETWEEN_REQUESTS[1])
          ) {
            ran_sleep = _.random(
              settings.SLEEP_BETWEEN_REQUESTS[0],
              settings.SLEEP_BETWEEN_REQUESTS[1]
            );
          } else {
            ran_sleep = _.random(450, 800);
          }
        } else if (_.isInteger(settings.SLEEP_BETWEEN_REQUESTS)) {
          const ran_add = _.random(20, 50);
          ran_sleep = settings.SLEEP_BETWEEN_REQUESTS + ran_add;
        } else {
          ran_sleep = _.random(450, 800);
        }

        logger.info(
          `<ye>[${this.bot_name}]</ye> | ${this.session_name} | Sleeping for ${ran_sleep} seconds...`
        );
        await sleep(ran_sleep);
      }
    }
  }
}
module.exports = Tapper;
