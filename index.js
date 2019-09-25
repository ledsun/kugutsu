const puppeteer = require('puppeteer')
const secret = require('./secret.json')

  ; (async function () {
    const browser = await puppeteer.launch({
      headless: true
    })

    try {
      const page = (await browser.pages())[0]
      await login(page)
      const reportNumbers = await getReportNumbers(page)

      // レポート数分繰り返す
      for (const reportNumber of reportNumbers) {
        await approveReport(page, reportNumber)
      }

      console.log('finish all!')

      return reportNumbers
    } catch (e) {
      console.error(e)
    } finally {
      browser.close()
    }
  })()

async function login(page) {
  const LOGIN_URL = 'https://workflow.luxiar.jp/10_luxiar/sys/login.asp'

  await page.goto(LOGIN_URL)
  await page.evaluate((secret) => {
    document.querySelector('#USER_ID')
      .value = secret.fusionId
    document.querySelector('#PASSWORD')
      .value = secret.fusionPassword
    document.querySelector('[type="button"')
      .click()
  }, secret)
  await page.waitForNavigation()
}

async function approveReport(page, reportNumber) {
  console.log(`start  ${reportNumber}`)

  const atBeforeOpen = new Date()
  await openReport(page, reportNumber)
  console.log(`  was opened ${durationFrom(atBeforeOpen)}ms`)

  const atBeforeConfirm = new Date()
  await goConfirmPage(page, reportNumber)
  console.log(`  was confirmed ${durationFrom(atBeforeConfirm)}ms`)

  const atBeforeAprove = new Date()
  await approve(page)
  console.log(`  was approved ${durationFrom(atBeforeAprove)}ms`)

  console.log(`finish ${reportNumber}`)
}

function durationFrom(at) {
  return new Date() - at
}

// 検索ページから対象の業務週報を取得
async function getReportNumbers(page) {
  const URL = 'https://workflow.luxiar.jp/10_luxiar/iframe/doc_search_list.asp?EV=SEARCH&DNO=106'
  await page.goto(URL)

  return await page.evaluate(() => {
    const table = document.querySelector('body > form > table:nth-child(2)')
    const trs = table.querySelectorAll('tr')

    // 承認対象の週報を集める
    const reportNumbers = []
    for (const tr of trs) {
      if (tr.children.length > 3 && tr.children[2].innerText === '業務週報' && tr.children[5].innerText === '幹部承認') {
        reportNumbers.push(tr.children[1].innerText)
      }
    }
    return reportNumbers
  })
}

// レポートへのリンクのイベントハンドラー `javascript:go_link('106','B98600P ','29','870')` は次の処理を行う
// ```js
// w=window.open('../sys/doc_frame.asp?EV=SEL&DNO=' + prm1 + '&ENO=' + prm2 + '&UNO=' + prm3,'DOC','toolbar=no,location=no,status=yes,resizable=no,scrollbars=yes,width=' + prm4 + ',height=' + iTmp + ',left=20,top=20');
// ```
async function openReport(page, reportNumber) {
  const URL = `https://workflow.luxiar.jp/10_luxiar/sys/doc_frame.asp?EV=SEL&DNO=106&ENO=${reportNumber}&UNO=29`
  await page.goto(URL)
}

// 承認ボタンのイベントハンドラー`javascript:go_link('AC','106','3','1','1','1','承　認','B98600P','5','B98G0005')`は次のような処理を行う
// ```js
// com_server_sent_doc()
// document.ENTRY_AREA.SEV.value = prm1;
// document.ENTRY_AREA.DNO.value = prm2;
// document.ENTRY_AREA.FNO.value = prm3;
// document.ENTRY_AREA.ANO.value = prm4;
// document.ENTRY_AREA.ML.value  = prm5;
// document.ENTRY_AREA.MLL.value = prm6;
// document.ENTRY_AREA.ENO.value = prm8;
// document.ENTRY_AREA.HNO.value = prm9;
// document.ENTRY_AREA.ETNO.value= prm10;
// document.ENTRY_AREA.submit();
// ```
async function goConfirmPage(page, reportNumber) {
  await page.evaluate((reportNumber) => {
    const frame = document.querySelector('html > frameset > frame:nth-child(2)')
    const form = frame.contentDocument.ENTRY_AREA
    const { hno, etno } = getParams(frame)

    form.SEV.value = 'AC'
    form.DNO.value = '106'
    form.FNO.value = '3'
    form.ANO.value = '1'
    form.ML.value = '1'
    form.MLL.value = '1'
    form.ENO.value = reportNumber
    form.HNO.value = hno
    form.ETNO.value = etno
    form.submit();

    // レポートのURLを開くと自動的にETNOが振られる。これがないと承認確認画面が開けない
    function getParams(frame) {
      const button = frame.contentDocument.querySelector('[value="承　認"]')
      const parameterString = button.getAttribute('onclick')
      const params = parameterString.match(/\((.*)\)/)[1].replace(/'/g, '').split(',')
      return { hno: params[8], etno: params[9] }
    }
  }, reportNumber)

  // フォームのsubmit完了を待つ。
  // frame単位で待つ必要があります。
  await page.frames().pop().waitForNavigation()
}

// 実行ボタンのハンドラー`javascript:doc_exec();`は次の処理をします。
// ```js
// document.ENTRY_AREA.submit();
// ```
async function approve(page) {
  await page.evaluate(() => {
    const frame = document.querySelector('html > frameset > frame:nth-child(2)')
    const form = frame.contentDocument.ENTRY_AREA
    form.submit()
  })

  // フォームのsubmit完了を待つ。
  // frame単位で待つ必要があります。
  await page.frames().pop().waitForNavigation()
}
