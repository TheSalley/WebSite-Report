import { mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import type { Page } from 'playwright'

/**
 * 截图管理器：将失败/警告项的截图保存到任务目录。
 * 目录结构：{baseDir}/task-{taskId}/{ruleKey}.png
 */
export class ScreenshotManager {
  private dir: string
  private taskId: number

  constructor(taskId: number, baseDir: string) {
    this.taskId = taskId
    this.dir = join(baseDir, `task-${taskId}`)
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true })
  }

  get taskDir(): string {
    return this.dir
  }

  /** 截取全页截图并保存，返回相对任务目录的文件名（失败返回 null） */
  async capture(page: Page, name: string): Promise<string | null> {
    try {
      const safeName = name.replace(/[^\w\u4e00-\u9fa5-]/g, '_')
      const filePath = join(this.dir, `${safeName}.png`)
      await page.screenshot({ path: filePath, fullPage: true })
      return `task-${this.taskId}/${safeName}.png`
    } catch {
      return null
    }
  }
}
