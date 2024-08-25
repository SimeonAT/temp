---
title: 'Backing up my Gitea Server'
description: "How I used Python to Back up the Repos on my Self-Hosted Gitea Server"
date: 2023-07-15
draft: false
---

Although [Github](https://github.com/) is amazing, I find it really fun to self-host my own Git server. It also provides peace of mind, as all of my Git repositories are in a server that I have ownership of (rather than being just on Github).

Furthermore, having a self-hosted Git server gives me the freedom to store large Git repositories. On the other hand, there are [hard limits](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github) to how big your repositories can be on Github.

## The Issue with Backing Up

When it comes to hosting my Git server, I use a Docker containerized version of [Gitea](https://about.gitea.com/).

<figure>
  <img src="/images/simeon-gitea.png"/>
  <figcaption>The front page of my self-hosted Gitea server.</figcaption>
</figure>

However, the problem with self-hosting Gitea using Docker is that it can be a bit of a *pain* to update the Gitea Docker container to the newest version. Every time there is a new update with Gitea, I have to:

1. Download the Docker container for the newest version of Gitea, and then,
2. Ensure that the new Gitea Docker container is able to access all of my Git repositories (which were accessible by the older Gitea Docker container).

Howevever, I always find that newer versions of Gitea are unable to read the repositories that I stored in an older version of Gitea.

<figure>
  <img src="/images/gitea-error.png"/>
  <figcaption>This is displayed in every repo every time I update Gitea.</figcaption>
</figure>

Fortunately, login and user information in Gitea remains intact when updating Gitea. Thus, the only issue that is of concern is migrating the repositories between different Gitea versions.

To work around this issue, I would have to locally save each repository I had on the old Gitea Docker container, and then push each of them individually on the new Gitea Docker container.

I considered backing up the repositories in the older container, and restoring them in a new container, every time there is a new Gitea update. However, doing so is not necessarily a trivial process. According to the [Gitea documentation](https://docs.gitea.com/administration/backup-and-restore#restore-command-restore):

> There is currently no support for a recovery command. It is a manual process that mostly involves moving files to their correct locations and restoring a database dump.

## The Proposed Solution

Unfortunately, the only solution seems to be going in and manually moving each repository from the older version of Gitea to the Docker container containing the newer version. However, this process is very tedious. Thus, I came up with the idea of writing a set of Python scripts to *automate* this process.

The Python scripts can be seen in this [Github repository](https://github.com/SimeonAT/GitBackupScripts). I use the [GitPython](https://github.com/gitpython-developers/GitPython) and [Request](https://requests.readthedocs.io/en/latest/) Python libraries in order to programmatically interact with Git and the Gitea REST API, respectively.

The Python scripts accomplish the tasks of backing up and restoring my Git repositories in 4 steps. There is a Python script responsible for each step.

1. Locally backing up the Git repositories from the old Gitea Docker container (`backup.py`).
2. Deleting inaccessible Git repositores in the new Gitea Docker container (`delete.py`).
3. Creating empty repositories in the the new Gitea Docker container (`create.py`).
4. Uploading the locally backed up Git repositories into the empty Gitea repositories in the new Docker container (`upload.py`).


### The Repos Dictionary

A [global dictionary](https://github.com/SimeonAT/GitBackupScripts/blob/main/scripts/repos.py) is used to keep track of all the repositories that need to be backed up and restored. The dictionary keeps a mapping
between the name of a given Gitea repository, and its SSH URL.

```python
REPO_URL_DICT = {
    "Insert repository name": "Insert SSH URL",
}
```

For example, the repos dictionary would look like the following:

```python
REPO_URL_DICT = {
  "GitBackupScripts" : "ssh://git@[URL to Gitea Server]/SimeonTG/GitBackupScripts.git",
  "MinecraftServer" : "ssh://git@[URL to Gitea Server]/SimeonTG/MinecraftServer.git",
  ...
}
```

Where `[URL to Gitea Server]` will be replaced with the actual URL of the self-hosted server on my local network.

### Step 1: Backing Up

Before I begin the process of downloading the latest version of Gitea, I run a script to get a local copy of all the repos I want to save.

```python
def clone(repos_dict):
    repos = {}

    for repoName in repos_dict.keys():
        print(f"Cloning {repoName}")

        url = repos_dict[repoName]
        path = os.path.join(BACKUP_DIR, repoName)

        repos[repoName] = Repo.clone_from(url, path)
        ssh_init(repos[repoName])

        print(f"Finished {repoName}")

    return repos
```

The above function clones each repository defined in `REPO_URL_DICT` on the Gitea server onto my computer. This function can take a long time to run, as it is cloning them one at a time (i.e. no `async` or multi-threading going on to speed up the process), and the repositories I hold on my Gitea server can be quite large.

### Step 2: Deleting Repos

After I have a local copy of all the repos I want to back up, I then download the Docker container for the latest version of Gitea. However, and as stated earlier, this will result in my Gitea repos being unable to be read by the newest version of Gitea.

<figure>
  <img src="/images/gitea-error.png"/>
  <figcaption>The next step is to delete all the inaccessible repos in the updated version in Gitea, like the one shown above.</figcaption>
</figure>

This is where `delete.py` comes in. The script will interact with REST API of the Docker container running the updated version of Gitea, in order to ensure that all repositories to be backed up have been deleted.

```python
def delete_repos(access_token, repos_url_dict):
  for repo_name in repos_url_dict:
    delete_url = \
      f"{common.BASE_URL}/repos/{common.USERNAME}/{repo_name}"

    response = requests.delete(
       delete_url,
       headers=common.token_header(access_token)
      )

    if (response.status_code == 204):
      print(f"{repo_name} successfully deleted")
    elif (response.status_code == 404):
      print(f"{repo_name} does not exist")    
    elif (response.status_code == 403):
      print(f"You are not authorized to delete {repo_name}")
    else:
      print(f"Failed to delete {repo_name}")

  return
```

### Step 3: Creating Empty Gitea Repos

The next step is to now create empty repositories, corresponding
to the names of the repositories we backed up.

```python
def create_repos(access_token, repos_url_dict):
  for repo_name in repos_url_dict:
    print(f"Creating {repo_name}")

    create_url = common.BASE_URL + f"/user/repos/"
    body = create_body(repo_name)

    response = requests.post(
      create_url,
      data=body,
       headers=common.token_header(access_token)
    )

    if (response.status_code == 201):
      print(f"{repo_name} successfully created")
    elif (response.status_code == 409):
      print(f"{repo_name} already exists")
    elif (response.status_code == 422):
      print(f"Validation error")
      print(response.json())
    else:
      print(response)
      print(f"Failed to create repository for {repo_name}")

  return
```

The function is relatively simple; all we do is send a POST to the Gitea API to create a new repository. Each repository will only have a `name` attribute:

```python
def create_body(repo_name):
  return {
      "name": repo_name
    }
```

### Step 4: Restoring the Backed up Repos

The final step is now restore the local Git repos backed up earlier.

```python
def upload(repos_url_dict):
    repos_dict = attach(BACKUP_DIR)

    for repoName in repos_dict.keys():
        repo = repos_dict[repoName]
        repoURL = repos_url_dict[repoName]

        print(f"Uploading {repoName} to Gitea")

        try:
          repo.git.remote("rm", "origin")
        except:
          print("No remote origin to remove")

        repo.git.remote("add", "origin", repoURL)
        repo.git.push("-u", "origin", "main")

        print(f"{repoName} has been successfully uploaded to Gitea")

    return
```

For each repository in the global dictionary `REPO_URL_DICT`, the above
function will push the local Git repository to the Gitea repository of the same name.

Note that throughout this whole backup and restoration process, the invariant of a Git repository's name is *never changed*, along with the Gitea user who owns it (it is me in this case).

Thus, since a repository's name is the same, the SSH URL of the repository will also be the same. This is why we can use the SSH URL that is mapped in `REPO_URL_DICT` for *both* backing up and restoring.

## Does it work?

In order to test if the Python scripts actually work, I will be updating my Gitea instance from version from `1.20.0+rc0` to version `1.21-dev`.

### Step 1: Backing up

I stored all the repositories that I wanted to back up in `repos.py`. I then ran the backup script using the command:

```bash
python3 ./scripts/backup.py
```

The backup ran successfully, giving the following output:

<figure>
  <img src="/images/backup-output.png"/>
  <figcaption>
    The reason the backup took so long was because of the large size of the <code>MinecraftServer</code> Git repo.
  </figcaption>
</figure>

Furthermore, local copies of the Git repos are stored in a newly created `/backups` directory.

<figure>
  <img src="/images/backup-dir.png">
  <figcaption>
    Local backups of the Gitea repositories.
  </figcaption>
</figure>

### Step 2: Deleting the Inaccessible Repos

As expected, the Gitea `1.21-dev` Docker container greets us with the following error:

<figure>
  <img src="/images/gitea-error2.png">
  <figcaption>
    The Gitea repository read error strikes again!
  </figcaption>
</figure>

Now that all the repos are saved locally, it is now time to run
the `delete.py` script.

<figure>
  <img src="/images/delete-output.png">
  <figcaption>
    The command line output.
  </figcaption>
</figure>

<figure>
  <img src="/images/ui-delete.png">
  <figcaption>
    The deletions were successful.
  </figcaption>
</figure>

### Step 3: Creating New Empty Repos

Now it is time to set the stage of `push`-ing the local repos to Gitea. We first need to create Gitea repositories that we can push to.

<figure>
  <img src="/images/create-output.png">
  <figcaption>
    The terminal output after running <code>create.py</code>.
  </figcaption>
</figure>


<figure>
  <img src="/images/empty-repos.png">
  <figcaption>
    Just a bunch of empty Git repos.
  </figcaption>
</figure>

### Step 4: Restoring the Backed up Repos

The final step is to now `push` the local Git repos onto the Gitea server.

<figure>
  <img src="/images/upload-terminal.png">
  <figcaption>
    The terminal output for <code>push</code>-ing the local repos back onto the Gitea server.
  </figcaption>
</figure>

<figure>
  <img src="/images/commit-history.png">
  <figcaption>
    We can see the script in action, as the whole commit history
    for the repos are pushed onto Gitea in a relatively short period of time.
  </figcaption>
</figure>


## Shortcomings and Rooms for Improvement

These scripts are definitely an improvement from doing the backup and restoration manually using the Gitea front-end. It would take me ~1 hour or so to do it manually. On the other hand, using Python scripts trim that down to ~30 minutes, with most of the time being taken from having to wait for the scripts to complete.

Nonetheless, there are a plethora of improvements that can be made to these scripts. The most significant improvements I believe could be made are as follows:

* The Python scripts assume that the repos to be backed up belong to the [Gitea user whose ssh key is being used](https://github.com/SimeonAT/GitBackupScripts/blob/main/scripts/common.py#L33).
As a result, the scripts can only back up and restore the Git repositories for only *one user*. This works for my case, as I am the only user in my Gitea server. 
However, this *prevents* these scripts from *being scalable* if there are multiple users in my self-hosted Gitea server, as the script will need to be run multiple times to back up each user's Gitea repos.

* The Python scripts are *slow*. It takes a long time to `clone` and `push` large Git repositories (for example, the `MinecraftServer` repo I mentioned earlier).
As I remarked earlier, I believe there are two solutions to solve this. One such solution is write [asynchronous Python](https://docs.python.org/3/library/asyncio.html) to `clone` and `push` multiple repositories in a simultaneous manner. Another solution is to use [multi-threading](https://docs.python.org/3/library/threading.html) in Python.
Based on my experience with [asynchronous Javascript](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise) and [Discord.py](https://discordpy.readthedocs.io/en/stable/), along with learning how difficult is to deal with race conditions and deadlock in my undergraduate OS class, I would lean more towards writing asynchronous code.

* Information about all the repositories to back up and store are placed in a [Python dictionary](https://github.com/SimeonAT/GitBackupScripts/blob/main/scripts/repos.py). This works fine for 8 repositories (how many I have as of writing this post), but terrible for 800 or 8000 repos.
The solution to this is to store all the repositories in a database. Given how the dictionary just stores mappings between a repository's name and SSH URL, my intuition would lead me to think than an SQL database would be the best solution.

* I got this improvement from fellow LinkedIn user [Shawn Armstrong](https://www.linkedin.com/feed/update/urn:li:activity:7086199530244751360?commentUrn=urn%3Ali%3Acomment%3A%28activity%3A7086199530244751360%2C7086220960198004736%29). Rather than having to interact with the Gitea REST API, I could instead consider using Docker directly to back up my Gitea repos. Even though the [Gitea backup and restoration process has to be done manually](https://docs.gitea.com/administration/backup-and-restore#restore-command-restore), I could write a script to automate this specific process. My thoughts are I could write this script in Bash with the [Docker CLI](https://docs.docker.com/engine/reference/commandline/cli/), or in Python using the [Docker SDK](https://docker-py.readthedocs.io/en/stable/).

## Conclusion

There is a lot of satisfaction to be had when it comes to self-hosting. However, as I have learned through this experience in managing my Gitea server, it comes with quite a bit of responsibility. Updating software, along backing up/restoring data, can be tedious tasks. 

In order to reduce the pain point of having to update the Gitea server, I wrote Python scripts to automate the process. I had a lot of fun creating these scripts, and despite how scrapy the code may be, it definitely made my life a whole lot easier (when it comes to managing the Gitea server).