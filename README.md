# jmcl

A simple minecraft launcher and version manager running on node. Allows you to launch or download Minecraft with one simple command!

## Command line usage

### Launch
```sh
jmcl launch -u <uname> -v <version of minecraft to be launched> 
```
It will prompt you to enter password if this is first run, where `<uname>` is the email address of your Mojang(Yggrasil) account.

Add `--offline` option to launch in offline mode, in which case `<uname>` should be in-game user name. ~~Should I remove this option to support Mojang?~~

To open a local TCP server and write all log output of Minecraft to it, add option `--pips [<port>]`. See [webmc](https://github.com/Hadron67/webmc) for more detail.

### Logout
```sh
jmcl logout -u <your email>
```

### Game installing and deleting
Install Minecraft version specified by `<version>`:
```sh
jmcl install <version>
```
It will do library and assets file checking if already installed, that is, download missing files and re-download files with bad check sums. To do this check for all installed versions, run
```sh
jmcl install-all
```
Sometimes the version file contains no check sum informations, this only happen to third party clients, *not Vanilla*. In this case there's no way to check their validity, so these files won't be re-downloaded if they are not missing. You may add `--redownload` option to the above two commands to force re-download all files that has no check sum information.

To delete a verion:
```sh
jmcl remove <version>
```
This would only remove the main jar package and version file. If you want to delete unnecessay libraries and asset files, you may want to use
```sh
jmcl cleanup
```
which will delete all game files that aren't used by any installed versions.

In addition, use
```sh
jmcl list
```
to list all installed versions, and
```sh
jmcl list-all
```
to view all available versions. Add `--release` option to list only release versions.

### Fabric, Optifine support
Just first install with their officially provided launcher and then you can launch them with `jmcl`. If you don't know their version name, run `jmcl list`. But since their version file contains no check sums, you have to use `--redownload` option if any library file get corrupted, such as a download failure.

### Forge
I'm sorry that Forge isn't fully supported. Although you can install and launch it the same way as Fabric and Optifine, the libraries listed in its version file is not all the libraries of it. So Forge installation will be corrupted if you run `jmcl cleanup`. I'm still working on the workarround.

## TODO
* Forge support.