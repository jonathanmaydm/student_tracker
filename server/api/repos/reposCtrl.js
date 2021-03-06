const configPath = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
const { github_token } = require(`../../../configs/${configPath}.config`);
const axios = require('axios');

module.exports = {
  getRepos(req, res) {
    let repo_count;
    axios
      .get('https://api.github.com/orgs/DevMountain')
      .then(response => {
        repo_count = response.data.public_repos;
        const promises = [];
        for (let i = 1; i <= Math.ceil(repo_count / 100); i++) {
          promises.push(
            axios.get(`https://api.github.com/orgs/DevMountain/repos?page=${i}&per_page=100&access_token=${github_token}`)
          );
        }
        axios
          .all(promises)
          .then(resp => {
            res.status(200).json(resp.reduce((acc, resObj) => [...acc, ...resObj.data], []));
          })
          .catch(err => console.log(`Error getting Public Repos: ${err}`));
      })
      .catch(err => console.log(`Error getting DevMountain organizational information: ${err}`));
  }
};
