/**
 * All of the code from this file comes from the following Stack Overflow post:
 * https://stackoverflow.com/a/59429852/6621292
 */

/**
 * The following import prevents a Font Awesome icon server-side rendering bug,
 * where the icons flash from a very large icon down to a properly sized one:
 */
import '@fortawesome/fontawesome-svg-core/styles.css';

/**
 * Prevent fontawesome from adding its CSS since we did it manually above:
 */
import { config } from '@fortawesome/fontawesome-svg-core';

config.autoAddCss = false; /* eslint-disable import/first */