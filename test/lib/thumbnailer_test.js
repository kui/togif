import test from 'ava'
import path from 'path'
import fs from 'fs'
import Thumbnailer from './../../src/lib/thumbnailer'
import { tmpDir } from './../../src/lib/util'
import del from 'del'

test(async t => {
  const thumbnailer = new Thumbnailer()
  const videoFile = path.resolve(__dirname, '..', 'big_buck_bunny.mp4')
  const destDir = await tmpDir({ prefix: 'test-' })
  const execution = thumbnailer.exec({
    videoFile,
    intervalMillis: 10000,
    destDir,
    ext: 'jpg'
  })
  const files = []
  execution.onNewThumbnail(async (thumbnail) => {
    console.log('thumbnail[%d]: ', files.length, thumbnail)
    files.push(thumbnail.file)
    t.notThrows(() => fs.statSync(thumbnail.file))
  })
  await execution.donePromise

  t.is(files.length, 7)

  await del(destDir, { force: true })
})
