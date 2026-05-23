import { styleText } from 'node:util'

/** Prints a colored step message to the console.
 *
 * @param message - The message to print.
 * @returns Nothing.
 */
export function logStep(message: string): void {
  console.log(styleText('cyan', message))
}

/** Prints a colored success message to the console.
 *
 * @param message - The message to print.
 * @returns Nothing.
 */
export function logSuccess(message: string): void {
  console.log(styleText('green', message))
}

/** Prints a colored error message to stderr.
 *
 * @param message - The message to print.
 * @returns Nothing.
 */
export function logError(message: string): void {
  console.error(styleText('red', message))
}

/** Prints a colored warning message to the console.
 *
 * @param message - The message to print.
 * @returns Nothing.
 */
export function logWarn(message: string): void {
  console.warn(styleText('yellow', `Warning: ${message}`))
}

/** Prints a colored informational message to the console.
 *
 * @param message - The message to print.
 * @returns Nothing.
 */
export function logInfo(message: string): void {
  console.log(styleText('blue', message))
}
