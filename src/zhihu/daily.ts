import lodash from 'lodash'
import { axiosInstance, expectResponseOk } from '../util/axios'
import { dingtalkRobot } from '../util/dingtalk'
import { runMain } from '../util/run'

interface IStory {
  title: string
  url: string
}

interface ILatestStories {
  date: string
  stories: IStory[]
  top_stories: IStory[]
}

async function main() {
  let result: ILatestStories = await axiosInstance
    .request({
      url: 'https://news-at.zhihu.com/api/4/stories/latest',
      headers: {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36',
      },
    })
    .then((resp) => {
      let { data } = resp
      expectResponseOk(resp)

      return data
    })

  let stories = lodash.concat(result.top_stories, result.stories)
  stories = lodash.uniqBy(stories, 'url')

  let title = `知乎日报 ${result.date}`
  let text = stories
    .map((item) => {
      return `- [${item.title}](${item.url})`
    })
    .join('\n')

  await dingtalkRobot.markdown(title, `${title}\n\n${text}`)
}

runMain(main)
