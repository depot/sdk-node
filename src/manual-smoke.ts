import {depot} from '.'

// Manual only: this script makes authenticated requests to the live Depot API.

async function main() {
  const res = await depot.core.v1.ProjectService.listProjects({})
  console.log(res)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
