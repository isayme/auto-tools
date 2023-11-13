import axios from 'axios'
import lodash from 'lodash'
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
  let result: ILatestStories = await axios
    .request({
      url: 'https://news-at.zhihu.com/api/4/stories/latest',
    })
    .then((resp) => {
      let { status, data } = resp
      if (status >= 300) {
        throw new Error(
          `request fail status ${status}, respBody: ${JSON.stringify(data)}`,
        )
      }

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
