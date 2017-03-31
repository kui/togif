// @flow

import tmp from 'tmp'

export function sleep (millis: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, millis))
}

export type TmpOptions = {
  prefix: string
}

export function tmpDir (opts: TmpOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    tmp.dir(opts, (err, path) => {
      if (err) {
        reject(err)
      } else {
        resolve(path)
      }
    })
  })
}
