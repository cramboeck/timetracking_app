In /etc/crowdsec/bouncers/crowdsec-firewall-bouncer.yaml (Phase 2):

    mode: iptables
    iptables_chains:
      - INPUT
      - DOCKER-USER

DOCKER-USER ist Pflicht: Zugriffe auf App/Portal (Docker-Ports 80/443)
laufen NICHT durch INPUT — ohne diese Kette sperrt der Bouncer nur SSH.
