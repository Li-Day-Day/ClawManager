# Temporary field-test policy based on AppArmor's apparmor-4.0
# profiles/apparmor/profiles/extras/bwrap-userns-restrict.
# Load only for the isolated native Runtime probe, then remove from the kernel.
abi <abi/4.0>,

include <tunables/global>
profile bwrap /usr/bin/bwrap flags=(attach_disconnected,mediate_deleted) {
  allow capability,
  allow file rwlkm /{**,},
  allow network,
  allow unix,
  allow ptrace,
  allow signal,
  allow mqueue,
  allow io_uring,
  allow userns,
  allow mount,
  allow umount,
  allow pivot_root,
  allow dbus,
  allow px /** -> bwrap//&unpriv_bwrap,
}

profile unpriv_bwrap flags=(attach_disconnected,mediate_deleted) {
  allow file rwlkm /{**,},
  allow network,
  allow unix,
  allow ptrace,
  allow signal,
  allow mqueue,
  allow io_uring,
  allow userns,
  allow mount,
  allow umount,
  allow pivot_root,
  allow dbus,
  allow pix /** -> &unpriv_bwrap,
  audit deny capability,
}
