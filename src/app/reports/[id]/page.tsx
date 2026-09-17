import PrintButton from '@/components/PrintButton'
import { FileDown } from 'lucide-react'
import { buildReportData, buildReportHtml } from '@/lib/report/report-service'

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let html = ''
  let error = ''
  try {
    const data = await buildReportData(Number(id))
    html = buildReportHtml(data)
  } catch (e) {
    error = (e as Error).message
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold">报告 # {id}</h1>
        {!error && (
        <div className="flex gap-2">
          <a
            href={`/api/tasks/${id}/report?format=pdf`}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-primary bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary-hover"
          >
            <FileDown className="h-4 w-4" /> 下载 PDF
          </a>
          <PrintButton>打印</PrintButton>
        </div>
      )}
      </div>
      {error ? (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          报告生成失败：{error}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl shadow-sm" dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </div>
  )
}

