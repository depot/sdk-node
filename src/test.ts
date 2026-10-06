import {depot} from '.'

async function main() {
  const res = await depot.core.v1.ProjectService.listProjects({})
  console.log(res)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
