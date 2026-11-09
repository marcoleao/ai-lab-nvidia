package platform

// CandidateIngressHostname never activates publication or resolves DNS.
func CandidateIngressHostname(p Publication) string {
	if p.Ingress == nil {
		return ""
	}
	if p.Ingress.Hostname != nil {
		return *p.Ingress.Hostname
	}
	if p.BaseDomain != nil {
		return "gateway." + *p.BaseDomain
	}
	return ""
}

func PublicDNSHostname(host string) bool { return validDomain(host) && !reservedPublicName(host) }
