import {depot} from '.'

async function main() {
  const res = await depot.core.v1.ProjectService.listProjects(
    {},
    {headers: {Authorization: `Bearer ${process.env.DEPOT_API_TOKEN}`}},
  )
  console.log(res)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
