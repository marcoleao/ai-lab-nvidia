# Preserve the distro's other settings; update the two installer-owned keys.
function finish_section() {
    if (section == "boot" && !systemd_written) { print "systemd=true"; systemd_written=1 }
    if (section == "user" && !user_written) { print "default=" operator; user_written=1 }
}
/^[ \t]*\[/ {
    finish_section()
    section=$0
    sub(/^[ \t]*\[/, "", section)
    sub(/\][ \t]*([#;].*)?$/, "", section)
    print
    next
}
section == "boot" && /^[ \t]*systemd[ \t]*=/ { if (!systemd_written) print "systemd=true"; systemd_written=1; next }
section == "user" && /^[ \t]*default[ \t]*=/ { if (!user_written) print "default=" operator; user_written=1; next }
{ print }
END {
    finish_section()
    if (!systemd_written) { print "[boot]"; print "systemd=true" }
    if (!user_written) { print "[user]"; print "default=" operator }
}
