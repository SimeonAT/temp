---
title: 'Using Python to Automatically Update my Docker Containers'
description: "The Python scripts I wrote to automate the process of updating my Docker containers"
date: 2023-09-21
draft: false
---

[Docker](https://www.docker.com/) containers are invaluable when it comes to hosting web applications on my self-hosted Synology server. They provide an easy way to host *any* application on the server, without needing to worry about installing the necessary dependencies for a given application.

To the best of my knowledge, it is not possible to "update" a Docker container, just as how one can update the software that is running on their computer. For each Docker container, I would have to:

1. Stop and delete the running container.
2. Delete the image that the deleted container was using.
3. Pull the latest version of the image from [Docker Hub](https://hub.docker.com/).
4. Create a new container that uses the image that was pulled in step (3).

Thus, the process of updating a Docker container can be tedious and a bit inconvenient.

Given that I previously worked on a [set of Python scripts](https://simeonat.github.io/posts/2023/06/git-python-scripts/) that automates the processes of backing up and restoring data on my Gitea instance, I decided to consider how I could use Python to automatically update my Docker containers. My research led me to the [Docker SDK](https://docker-py.readthedocs.io/en/stable/), which gives one the ability to control Docker *programmatically* with the use of Python.

In this post, I will discuss how I used the Python Docker SDK to write scripts that automated the process of updating my Docker containers. The complete source code for these scripts can be found in the [Github repository](https://github.com/SimeonAT/DockerUpdateScripts) that accompanies this blog post.

## The Containers to Update

Before we begin to dive into the source code itself, let us first examine *which specific* Docker containers will the Python scripts be updating. Information about the Docker containers to be updated are represented are stored in the `/data` [directory](https://github.com/SimeonAT/DockerUpdateScripts/tree/main/data) of the codebase.

The `/data` directory houses two `json` files: `container.json` and `image.json`.

### The Container Data

The `container.json` [file](https://github.com/SimeonAT/DockerUpdateScripts/blob/main/data/container.json) contains information about the Docker containers to be updated and their specific configurations. 

The Python scripts will use this file to determine the containers to be updated, along with the specific settings that each container should have.

For my specific use case, I wanted to update the Docker containers for my [Vaultwarden](https://github.com/dani-garcia/vaultwarden) and [Gitea](https://about.gitea.com/) instances. My specific configurations for `container.json`, that allowed me to accomplish this, is shown below. Note that I have redacted sensisitve information regarding the specific ports and volumes used by the self-hosted server.

```json
{
  "vaultwarden/server": {
    "tag": "latest",
    "ports": {
      "80/tcp": "[insert port as a number (not as a string)]"
    },
    "volumes": {
      "[path on your machine to store container data]": {"bind": "/data", "mode": "rw"}
    }
  },
  "gitea/gitea": {
    "tag": "nightly",
    "ports": {
      "22/tcp": "[insert port as a number (not as a string)]",
      "3000/tcp": "[insert port as a number (not as a string)]"
    },
    "volumes": {
      "[path on your machine to store container data]": {"bind": "/data/gitea", "mode": "rw"}
    }
  }
}
```

I used the configurations to state which specific ports and and volumes on my Synology server should be used by the *virtual* ports and volumes of the two Docker containers.

Having this JSON file allows me to easily track with Docker containers I would like to update. If I would like the Python scripts to update additional Docker containers, all I would need to do is to add new entries into the `containers.json` file.

### The Image Data

The `image.json` file holds information about the specific *images* that the containers will be utilizing. The contents of this file is much more straightforward when compared to `containers.json`. It simply holds a mapping between an image and its *tag*, which will be used to note the specific version of the image that the Python scripts should download from the Docker Hub. 

```json
{
  "vaultwarden/server": "latest",
  "gitea/gitea": "nightly"
}
```

The above JSON objects are the specific configurations that I used in `image.json`, in order to update the Vaultwarden and Gitea images that are used by the containers running in my server. If I added a new container to be updated in `container.json`, I would need to add the image it is using in the `image.json` file. If not, then the scripts would not know which image to update in order to properly update the container in question.


## Taking a Look at the Codebase

With an understanding of the Docker containers and images that the Python scripts will update, let us now examine the scripts themselves.

### The Services

Although the codebase is made up of multiple scripts, the responsibility of actually updating the Docker containers takes place in a [single script](https://github.com/SimeonAT/DockerUpdateScripts/blob/main/scripts/main.py) called `main.py`. 

All of the other Python scripts (with the exception of `e2e.py`, which is used for testing purposes -  later), are *services*. That is,
their sole purpose is to provide `main.py` with the necessary functions that it will use to do its job of updating the Docker containers.

With that in mind, let us now dive into the fmore on thisunctionality of each of the services used in `main.py`.

#### The Image Service

The [Image Service](https://github.com/SimeonAT/DockerUpdateScripts/blob/main/scripts/image.py) is responsible for adding and deleting the images referenced in `data/image.json`.

```python
class Service:

  def __init__(self, client, json_path):
    self.client = client
    self.images = read_json(json_path)
    return

  def download(self):
    for name in self.images:
      tag = self.images[name]
      self.client.images.pull(name, tag=tag)

      print(f'Successfully pulled {name}:{tag}')
    return

  def delete(self):
    for name in self.images:
      tag = self.images[name]
      tagged_name = f'{name}:{tag}'
      self.client.images.remove(tagged_name)

      print(f'Deleted {name}')
    return
```

Note that the Image Service's `download()` and `delete()` functions *does not* "download" (i.e. pull from the Docker Hub) or delete, respectively, a particular single image. Rather, the Image Service will be given the path to the `image.json` when created, and its constructor will read the file. Whenever `download()` or `delete()` is called, it will download or delete, respectively, *all* of the images specified in `image.json`.

Given that the Image Service does the download and delete operations for all the image specified in one pass, one must be wondering: what if some of the images have been downloaded, and others have not? More on this later (when we further discuss `main.py`), but the short answer is that the invariant assumed by the Image Service is that *all* images (specified in `image.json`) are either present in the server, or they all have already been deleted.

#### The Container Service

The [Container Service](https://github.com/SimeonAT/DockerUpdateScripts/blob/main/scripts/container.py) operates in a similar manner to the Image Service. However, as indicated by the name, the service manages the containers specified in `data/container.json`.

```python
class Service:

  def __init__(self, client, json_path):
    self.client = client
    self.containers = read_json(json_path)
    return

  def run(self):
    for image_name in self.containers:
      settings = self.containers[image_name]
      volumes = settings['volumes']
      ports = settings['ports']
      tag = settings['tag']

      running_name = get_running_name(image_name, tag)
      self.client.containers.run(
        name=get_container_name(image_name),
        image=running_name,
        ports=ports,
        volumes=volumes,
        detach=True
      )

      print(f'Container for {running_name} is now running')
    return

  def delete(self):
    for container in self.client.containers.list():
      container.stop()
      print(f'Stopping {container.name}')

      container.remove()
      print(f'Deleted {container.name}')
    return
```

In a similar fashion to the Image Service, the Container Service will be given the path of `container.json`, and will read its contents when it is first created. It will then do its `delete()` and `run()` operations on *all* of the containers specified in `container.json`.

#### The Test Service

Unlike the Image and Container services, the [Test Service](https://github.com/SimeonAT/DockerUpdateScripts/blob/main/scripts/test.py) serves a dual purpose: it is used in by `main.py`, and in `e2e.py`, which contains an informal "end-to-end test" that tests the functionality of the Image and Container services (more on this in the next section).

```python
class Service:

  def __init__(self, client, image_path, container_path):
    self.client = client
    self.images = read_json(image_path)
    self.containers = read_json(container_path)
    return

  def _get_image_tag(self, image_name):
    return self.images[image_name]

  def images_exist(self):
    for image in self.images:
      tag = self._get_image_tag(image)
      name = f'{image}:{tag}'
      self.client.images.get(name)

      print(f'TEST: Image {name} has already been pulled')
    return

  def containers_running(self):
    for image_name in self.containers:
      name = get_container_name(image_name)

      container = self.client.containers.get(name)
      assert(container.status == 'running')

      print(f'TEST: Container {name} is running')
    return

  def containers_deleted(self):
    for image_name in self.containers:
      name = get_container_name(image_name)
      assert([] == self.client.containers.list(
        filters={"name": name}
      ))

      print(f'TEST: Container {name} is not present')
    return

  def images_deleted(self):
    for name in self.images:
      assert([] == self.client.images.list(name=name))

      print(f'TEST: Image {name} is not present')
    return
```

As can be seen in the source code above, the test is an essentially provides an interface to check the presence or abscence of the containers and images specified in `container.json` and `image.json`, respectively.

### The End to End Tests

Before creating `main.py`, I wanted to ensure that the Image and Container services were working as expected. Assuming that the none of the containers and images are on the server, I wrote a [script](https://github.com/SimeonAT/DockerUpdateScripts/blob/main/scripts/e2e.py) called `e2e.py` that used these two services to:

1. Pull the Docker images,
2. Create and run the containers,
3. Stop and delete the containers, and
4. Delete the images.
  
I utilized the functions in the Test Service to assert that the invariants in steps (1) to (4) occured in the exact order. If any of the steps failed, the script would immediately stop and throw an error.

The source code of the `e2e.py` script is shown below:

```python
if __name__ == '__main__':
  client = connect()
  image_service = image.Service(client, IMAGES_PATH)
  container_service = container.Service(client, CONTAINERS_PATH)
  test_service = test.Service(client, IMAGES_PATH, CONTAINERS_PATH)

  # Can the Docker Images be downloaded?
  image_service.download()
  test_service.images_exist()

  # Can we run the Docker Containers with our specified settings?
  container_service.run()
  test_service.containers_running()

  # Can we stop and delete the Docker Containers?
  container_service.delete()
  test_service.containers_deleted()

  # Can we delete the Docker Images?
  image_service.delete()
  test_service.images_deleted()
```

Whenever the script threw an error, I would investigate, and fix, the bugs that occured in either the Image or Container services (or in both). Once I was able to run `e2e.py` without any errors, I was sure that the services were working as intended.

### Where All the Action Happens

We can now talk about `main.py`, the [source code](https://github.com/SimeonAT/DockerUpdateScripts/blob/main/scripts/main.py) of which is shown below.

```python
if __name__ == '__main__':
  client = connect()
  image_service = image.Service(client, IMAGES_PATH)
  container_service = container.Service(client, CONTAINERS_PATH)
  test_service = test.Service(client, IMAGES_PATH, CONTAINERS_PATH)

  try:
    test_service.images_exist()
    test_service.containers_running()

    container_service.delete()
    image_service.delete()
  except:
    print(
      'Images and Containers not present - no need for deletions'
    )

  image_service.download()
  container_service.run()
```

To understand the implementation of the script, we will examine each logical block in detail.

The first action that the main script takes is to initialize each of the services.

```python
  client = connect()
  image_service = image.Service(client, IMAGES_PATH)
  container_service = container.Service(client, CONTAINERS_PATH)
  test_service = test.Service(client, IMAGES_PATH, CONTAINERS_PATH)
```
We give each service access to the [Docker daemon](https://docker-py.readthedocs.io/en/stable/client.html), and the path of `container.json` and/or `image.json`, depending on their needs. The path to these two JSON files are stored as variables defined in the `common.py` [helper file](https://github.com/SimeonAT/DockerUpdateScripts/blob/main/scripts/common.py).

After the service is initialized, we can now begin the update process. We start by checking whether or not the Docker containers to be updated, and the images they are using, are running. If they are, then we need to stop those containers, delete them, and delete the images they are using. 

```python
  try:
    test_service.images_exist()
    test_service.containers_running()

    container_service.delete()
    image_service.delete()
  except:
    print(
      'Images and Containers not present - no need for deletions'
    )
```

The above implementation might seem strange, as we are using `try-except` to determine whether or not the Docker containers and images are running. The reason for this approach is because we already have code that can check for the existence of containers and images - they are provided by the [Test Service](https://github.com/SimeonAT/DockerUpdateScripts/blob/main/scripts/test.py). 

However, they operate by throwing an error if the containers and/or images are present. We could write additional code that utilizes if/else to accomplish this task, but it is better to use the Test Service in order to follow the principle of "DRY", or "Don't Repeat Yourself".

After the images and containers are removed from the server (if they were being used by the server earlier), we can then pull the newest version of the images from the Docker Hub, and start the containers (using the specified settings in `container.json`).

```python
  image_service.download()
  container_service.run()
```

## Does it Work?

In order to test the scripts, I decided to update the Docker containers for my self-hosted Vaultwarden and Gitea instances. Their respective versions *before* I ran the scripts were as follows:

<figure>
  <img src="/images/VaultwardenBefore.png">
  <figcaption>
    The version of my Vaultwarden instance before the running the scripts.
  </figcaption>
</figure>

<figure>
  <img src="/images/GiteaBefore.png">
  <figcaption>
    The version of my Gitea instance before I ran my scripts.
  </figcaption>
</figure>

After checking the versions, I then ran the Python scripts. I recorded a demonstration video of what the Synology's [Container Manager](https://www.synology.com/en-us/dsm/feature/container-manager) displayed as the scripts were running:

<figure>
  <iframe width="560" height="315" src="https://www.youtube.com/embed/X56jbcU3hM4?si=0u7OU3L_IcXRPJco" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
  <figcaption>
    The video perfectly displays the containers being stopped, deleted, and recreated, and the images being removed and re-pulled from the Docker Hub. Even though the Container Manager still said "Vaultwarden" had to be updated, I was able to confirm that the container did update nonetheless, by checking on its version number (discussed further below in this post).
  </figcaption>
</figure>

After the scripts ran, I checked the versions of the both the Gitea and Vaultwarden Docker containers. Sure enough, they were all updated.

<figure>
  <img src="/images/VaultwardenAfter.png">
  <figcaption>
    The Vaultwarden instance updated from version <code>1.29.1</code> to <code>1.29.2</code>.
  </figcaption>
</figure>

<figure>
  <img src="/images/GiteaAfter.png">
  <figcaption>
    Even though the version itself is still the same, the Gitea instance updated from build <code>dev-512</code> to <code>dev-782</code>.
  </figcaption>
</figure>

In other words, the scripts were able to update my Docker containers!

## Wrapping Up

As I wrap up this post, I should address the elephant in the room: although the Python scripts I wrote were successfully in the task of automatically updating my Docker containers, I did *reinvent the wheel*. I could have used the [Watchtower](https://github.com/containrrr/watchtower) application, which is an already existing open-source solution that can automatically update my Docker containers. 

Nonetheless, I still decided to create these Python scripts.  It provided a great learning experience on how to *programtically* use Docker, and I have a ton of fun playing around with the [Python Docker SDK](https://docker-py.readthedocs.io/en/stable/). 

Now that I have some familiarity with the Docker SDK, I am excited so see what cool new Docker projects that I can up with next. As the common saying goes, *the possibilites are endless*.