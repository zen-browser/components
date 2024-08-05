import { Config } from "./config";

export default class Component {
  readonly config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  log(message: string) {
    if (this.config.debug) {
      console.log(this.config.browserName + ': ' + message);
    }
  }
}
